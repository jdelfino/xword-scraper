'use strict';

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const AWS = require('aws-sdk');
const moment = require ('moment');
const dynamoclient = require('serverless-dynamodb-client');
const secretsPromise = require('serverless-secrets/client');

var dynamodb = dynamoclient.raw;
const tableName = "xword";

function isInt(value) {
  return !isNaN(value) &&
  parseInt(Number(value)) == value &&
  !isNaN(parseInt(value, 10));
}

module.exports.scrape = async function(event, context, callback) {
  //await deleteTableIfNeeded(dynamodb);
  //await createTableIfNeeded(dynamodb);
  await secretsPromise.load();

  const opts = {
    credentials: 'include',
    headers: {
      cookie: process.env.COOKIE
    }
  };

  const response = await fetch('https://www.nytimes.com/puzzles/leaderboards', opts);
  const body = await response.text();
  const items = []
  const date = moment().format("YYYY-MM-DD");

  const $ = cheerio.load(body);
  $('.lbd-score').each((index, e) => {
    const name = $(e).find('.lbd-score__name').text().split(" ")[0];
    const rank = $(e).find('.lbd-score__rank').text();
    const timestr = $(e).find('.lbd-score__time').text();
    const timeComponents = timestr.split(":");
    const timeSecs = (60*parseInt(timeComponents[0], 10)) + parseInt(timeComponents[1]);

    if (!isInt(rank)) {
      console.log(name, "not completed, skipping")
      return;
    }
    console.log(date, rank, name, timeSecs)

    items.push({
      PutRequest: {
        Item: {
          "date": { S: date },
          "rank": { N: rank },
          "name": { S: name },
          "time_secs": { N: timeSecs.toString()},
        }
      }
    });
  });
  if (items.length === 0) {
    return;
  }

  const req = {
    RequestItems: {
      [tableName]: items,
    }
  }
  console.log("Inserting", JSON.stringify(req, null, 2));

  await dynamodb.batchWriteItem(req).promise().then((data) => {
    console.log("Scraped successfully", data);
  });

};

