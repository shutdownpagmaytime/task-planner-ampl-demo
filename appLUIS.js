require('dotenv').config()
var restify = require('restify')
var builder = require('botbuilder')
var azure = require('azure-storage')
var lodash = require('lodash')

// =========================================================
// Azure Table Setup
// =========================================================

var tableSvc = azure.createTableService('taskplannerstorage', process.env.AZURE_STORAGE)

// =========================================================
// Bot Setup
// =========================================================

// Setup Restify Server
var server = restify.createServer()
server.listen(process.env.port || process.env.PORT || 3978, function () {
  console.log('%s listening to %s', server.name, server.url)
})

// Create chat bot
var connector = new builder.ChatConnector({
  appId: process.env.APP_ID,
  appPassword: process.env.APP_PASS
})

var bot = new builder.UniversalBot(connector)
server.post('/api/messages', connector.listen())

// Setup LUIS connection

var model = 'https://task-planner-ampl.cognitiveservices.azure.com/luis/prediction/v3.0/apps/ec9e06bc-c945-43dd-868c-ce34c7a25e0d/slots/production/predict?subscription-key=ff243b3c0053464789bde3820b8ec8fb&verbose=true&show-all-intents=true&log=true'
var recognizer = new builder.LuisRecognizer(model)
var dialog = new builder.IntentDialog({recognizers: [recognizer]})
bot.dialog('/', dialog)

// =========================================================
// LUIS Dialogs
// =========================================================

dialog.matches('Greeting', [
  function (session, results) {
    session.send('Welcome to Task-Planner! Can I help find a session for you?')
  }
])

dialog.matches('SearchByDay', [
  function (session, results) {
    session.beginDialog('/SearchDay', results)
  }
])

dialog.matches('SearchByName', [
  function (session, results) {
    session.beginDialog('/SearchName', results)
  }
])

dialog.matches('SearchByTime', [
  function (session, results) {
    session.beginDialog('/SearchTime', results)
  }
])

dialog.matches('EndConvo', [
  function (session, results) {
    session.send('Have a great! Bye!')
  }
])

dialog.matches('MainMenu', [
  function (session, results) {
    session.beginDialog('/mainMenu', results)
  }
])

dialog.onDefault([
  function (session, results) {
    session.send('Sorry.. I did\'t understand that. Let me show you what I can do.')
    session.beginDialog('/mainMenu', results)
  }
])

// =========================================================
// Bots Dialogs
// =========================================================

var data = {}

// present the user with a main menu of choices they can select from
bot.dialog('/mainMenu', [
  function (session, results) {
    builder.Prompts.choice(session, 'I can do any of these, pick one!', ['Search Sessions By Day', 'Search Sessions By Name', 'Search Sessions By Time'])
  },
  function (session, results) {
    switch (results.response.index) {
      case 0:
        // Initiate "Search By Day" dialog
        session.beginDialog('/SearchDay')
        break
      case 1:
        // Initiate "Search By Name" dialog
        session.beginDialog('/SearchName')
        break
      case 2:
        // Initiate "Search By Time" dialog
        session.beginDialog('/SearchTime')
        break
    }
  }
])

// either extract the LUIS entity or ask the user for a day to search -- display the results
bot.dialog('/SearchDay', [
  function (session, results, next) {
    // check if results.entities is undefiend
    if (typeof results !== 'undefined' && results.entities) {
      var day = builder.EntityRecognizer.findEntity(results.entities, 'day')
      if (!day) {
        builder.Prompts.text(session, 'What day would you like to search?')
      } else {
        next({ response: day.entity })
      }
    } else {
      // prompt the user for the text manually
      builder.Prompts.text(session, 'What day would you like to search?')
    }
  },
  function (session, results) {
    if (results.response) {
      session.send('Searching for %s\'s schedule. One moment.', results.response)
    }
    // capitalize to query DB
    results.response = lodash.capitalize(results.response)
    results.type = 'day'
    // display card with data
    RetrieveSchedule(session, results, function (session) {
      // test if data is populated (results found)
      if (data.isSuccess) {
        // display card with data
        var msg = DisplayCardData(session)
        session.send(msg)
      } else {
        session.send('Sorry.. no results matched your search. Please try again!')
      }
      session.endDialog()
    })
  }
])

// either extract the LUIS entity or ask the user for a name to search -- display the results
bot.dialog('/SearchName', [
  function (session, results, next) {
    if (typeof results !== 'undefined' && results.entities) {
      var name = builder.EntityRecognizer.findEntity(results.entities, 'firstName')
      if (!name) {
        builder.Prompts.text(session, 'What name would you like to search?')
      } else {
        next({ response: name.entity })
      }
    } else {
      // prompt the user for the text manually
      builder.Prompts.text(session, 'What name would you like to search?')
    }
  },
  function (session, results) {
    if (results.response) {
      session.send('Searching for %s in the schedule. One moment.', results.response)
    }
    // capitalize to query DB
    results.response = lodash.capitalize(results.response)
    if ((results.response === 'Kevin') || (results.response === 'Hao') || (results.response === 'David')) {
      results.type = 'firstName'
    } else {
      results.type = 'cofirstName'
    }
    // display card with data
    RetrieveSchedule(session, results, function (session) {
      // test if data is populated (results found)
      if (data.isSuccess) {
        // display card with data
        var msg = DisplayCardData(session)
        session.send(msg)
      } else {
        session.send('Sorry.. no results matched your search. Please try again!')
      }
      session.endDialog()
    })
  }
])

// either extract the LUIS entity or ask the user for a time to search -- display the results
bot.dialog('/SearchTime', [
  function (session, results, next) {
    if (typeof results !== 'undefined' && results.entities) {
      var time = builder.EntityRecognizer.findEntity(results.entities, 'time')
      if (!time) {
        builder.Prompts.text(session, 'What time would you like to search?')
      } else {
        next({ response: time.entity })
      }
    } else {
      // prompt the user for the text manually
      builder.Prompts.text(session, 'What time would you like to search?')
    }
  },
  function (session, results) {
    if (results.response) {
      session.send('Searching today\'s schedule for %s session. One moment.', results.response)
    }
    results.type = 'time'
    // display card with data
    RetrieveSchedule(session, results, function (session) {
      // test if data is populated (results found)
      if (data.isSuccess) {
        // display card with data
        var msg = DisplayCardData(session)
        session.send(msg)
      } else {
        session.send('Sorry.. no results matched your search. Please try again!')
      }
      session.endDialog()
    })
  }
])

// =========================================================
// Helper Functions - Query Azure Table
// =========================================================

function RetrieveSchedule (session, response, onQueryFinish, next) {
  var query = new azure.TableQuery()
    .top(3)
    .where(response.type + ' eq ?', response.response)

  tableSvc.queryEntities('GoTo', query, null, function (error, result, response) {
    if ((!error) && (result.entries[0])) {
      data.isSuccess = true
      // Manipulate results into JSON object for card
      data.firstName = result.entries[0].firstName._
      data.lastName = result.entries[0].lastName._
      data.day = result.entries[0].day._
      data.time = result.entries[0].time._
      data.talk = result.entries[0].talk._
      data.link = result.entries[0].link._
      data.image = result.entries[0].image._
      data.abstract = result.entries[0].abstract._
      data.cofirstName = result.entries[0].cofirstName._
      data.colastName = result.entries[0].colastName._

      onQueryFinish(session)
    //  next()
    } else {
      data.isSuccess = false
      console.log(error)
      onQueryFinish(session)
    }
  })
}

function DisplayCardData (session) {
  // display card with data
  var msg = new builder.Message(session)
    .textFormat(builder.TextFormat.xml)
    .attachments([
      new builder.ThumbnailCard(session)
            .title(data.talk)
            .subtitle(data.firstName + ' ' + data.lastName + ' & ' + data.cofirstName + ' ' + data.colastName + ' | ' + data.day + ' at ' + data.time)
            .text(data.abstract)
            .images([builder.CardImage.create(session, data.image)])
            .tap(builder.CardAction.openUrl(session, data.link))
    ])
  return msg
}
let calendar = document.querySelector('.calendar')

const month_names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

isLeapYear = (year) => {
    return (year % 4 === 0 && year % 100 !== 0 && year % 400 !== 0) || (year % 100 === 0 && year % 400 ===0)
}

getFebDays = (year) => {
    return isLeapYear(year) ? 29 : 28
}

generateCalendar = (month, year) => {

    let calendar_days = calendar.querySelector('.calendar-days')
    let calendar_header_year = calendar.querySelector('#year')

    let days_of_month = [31, getFebDays(year), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

    calendar_days.innerHTML = ''

    let currDate = new Date()
    if (!month) month = currDate.getMonth()
    if (!year) year = currDate.getFullYear()

    let curr_month = `${month_names[month]}`
    month_picker.innerHTML = curr_month
    calendar_header_year.innerHTML = year

    // get first day of month
    
    let first_day = new Date(year, month, 1)

    for (let i = 0; i <= days_of_month[month] + first_day.getDay() - 1; i++) {
        let day = document.createElement('div')
        if (i >= first_day.getDay()) {
            day.classList.add('calendar-day-hover')
            day.innerHTML = i - first_day.getDay() + 1
            day.innerHTML += `<span></span>
                            <span></span>
                            <span></span>
                            <span></span>`
            if (i - first_day.getDay() + 1 === currDate.getDate() && year === currDate.getFullYear() && month === currDate.getMonth()) {
                day.classList.add('curr-date')
            }
        }
        calendar_days.appendChild(day)
    }
}

let month_list = calendar.querySelector('.month-list')

month_names.forEach((e, index) => {
    let month = document.createElement('div')
    month.innerHTML = `<div data-month="${index}">${e}</div>`
    month.querySelector('div').onclick = () => {
        month_list.classList.remove('show')
        curr_month.value = index
        generateCalendar(index, curr_year.value)
    }
    month_list.appendChild(month)
})

let month_picker = calendar.querySelector('#month-picker')

month_picker.onclick = () => {
    month_list.classList.add('show')
}

let currDate = new Date()

let curr_month = {value: currDate.getMonth()}
let curr_year = {value: currDate.getFullYear()}

generateCalendar(curr_month.value, curr_year.value)

document.querySelector('#prev-year').onclick = () => {
    --curr_year.value
    generateCalendar(curr_month.value, curr_year.value)
}

document.querySelector('#next-year').onclick = () => {
    ++curr_year.value
    generateCalendar(curr_month.value, curr_year.value)
}

let dark_mode_toggle = document.querySelector('.dark-mode-switch')

dark_mode_toggle.onclick = () => {
    document.querySelector('body').classList.toggle('light')
    document.querySelector('body').classList.toggle('dark')
}
//Task-Planner-AMPL
//https://task-planner-ampl-999.azurewebsites.net/api/messages
