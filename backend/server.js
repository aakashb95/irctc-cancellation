require('dotenv').config();
const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/pnr/:pnrNumber', (req, res) => {
  const { pnrNumber } = req.params;
  
  const options = {
    method: 'GET',
    hostname: 'irctc-indian-railway-pnr-status.p.rapidapi.com',
    port: null,
    path: `/getPNRStatus/${pnrNumber}`,
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'irctc-indian-railway-pnr-status.p.rapidapi.com'
    }
  };

  const request = https.request(options, function (response) {
    const chunks = [];

    response.on('data', function (chunk) {
      chunks.push(chunk);
    });

    response.on('end', function () {
      const body = Buffer.concat(chunks);
      res.json(JSON.parse(body.toString()));
    });
  });

  request.on('error', (error) => {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while fetching PNR details.' });
  });

  request.end();
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});