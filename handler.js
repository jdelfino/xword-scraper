'use strict';

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const AWS = require('aws-sdk');
const moment = require ('moment');
const dynamoclient = require('serverless-dynamodb-client');

var dynamodb = dynamoclient.raw;
const tableName = "xword";

const opts = {
  credentials: 'include',
  headers: {
    //cookie: 'NYT-S:3wUynm3o7trhRn0GA9iI//U.oeETWQUIrPXi8cQXCbq67XS6LZ3sVzEYZit1RpmkKsjOoea6bgYnQZRe3IhyWEUWmjYP1rigAIpz4SYs6mdtAHBIBy9OLvz7c3Txvawp6LTL3qztduBxxtPUtTRRjj85wiHXOM2Q00aL6aUKSoWjyLuChU7YnT/mMKgY.A8Y3gniMIU4Cl3VIt6pClcHsdcwlUeiuEpOdHOigM186eeVDCzqMvLRHNpmXh8EYmNXrSLzgZpYPh/RZttyODRXA2Rr6AkHyGrsKL10NXcbB8eFs0'
    cookie: 'NYT-S=3wUynm3o7trhRn0GA9iI//U.oeETWQUIrPXi8cQXCbq67XS6LZ3sVzEYZit1RpmkKsjOoea6bgYnQZRe3IhyWEUWmjYP1rigAIpz4SYs6mdtAHBIBy9OLvz7c3Txvawp6LTL3qztduBxxtPUtTRRjj85wiHXOM2Q00aL6aUKSoWjyLuChU7YnT/mMKgY.A8Y3gniMIU4Cl3VIt6pClcHsdcwlUeiuEpOdHOigM186eeVDCzqMvLRHNpmXh8EYmNXrSLzgZpYPh/RZttyODRXA2Rr6AkHyGrsKL10NXcbB8eFs0;'
  }
};

function isInt(value) {
  return !isNaN(value) &&
  parseInt(Number(value)) == value &&
  !isNaN(parseInt(value, 10));
}

/*
AWS.config.update({
  region: "us-west-2",
  endpoint: "http://localhost:8000",
  accessKeyId: "fakeMyKeyId",
  secretAccessKey: "fakeSecretAccessKey",
  sslEnabled:     false,
});

var dynamodb = new AWS.DynamoDB();
*/
/*
async function createTableIfNeeded(dclient) {
  var params = {
    TableName : tableName,
    KeySchema: [
      { AttributeName: "date", KeyType: "HASH"},  //Partition key
      { AttributeName: "name", KeyType: "RANGE" }  //Sort key
    ],
    AttributeDefinitions: [
      { AttributeName: "date", AttributeType: "S" },
      { AttributeName: "name", AttributeType: "S" },
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 10,
      WriteCapacityUnits: 10
    }
  };

  return dclient.listTables({}).promise().then((data) => {
    console.log(data.TableNames);
    if (data.TableNames.indexOf(tableName) === -1) {
      return dclient.createTable(params).promise();
    }
    return Promise.resolve();
  }).then((data) => {
    console.log("Created table", data);
  });
};

async function deleteTableIfNeeded(dclient) {
   return dclient.listTables({}).promise().then((data) => {
    console.log(data.TableNames);
    if (data.TableNames.indexOf(tableName) === -1) {
      return Promise.resolve();
    }
    return dynamodb.deleteTable({TableName: tableName}).promise();
  }).then((data) => {
    console.log("Deleted table", data);
  });
}
*/

module.exports.scrape = async function(event, context, callback) {
  //await deleteTableIfNeeded(dynamodb);
  //await createTableIfNeeded(dynamodb);
  await dynamodb.scan({TableName: tableName}).promise().then((data) => {
    console.log("scan result", JSON.stringify(data, null, 2));
  });

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
      console.log("Not completed, skipping")
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

