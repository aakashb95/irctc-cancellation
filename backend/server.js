require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/pnr/:pnrNumber', async (req, res) => {
  const { pnrNumber } = req.params;
  
  const url = `https://irctc1.p.rapidapi.com/api/v3/getPNRStatus?pnrNumber=${pnrNumber}`;
  const options = {
    method: 'GET',
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'irctc1.p.rapidapi.com'
    }
  };

  try {
    const response = await fetch(url, options);
    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while fetching PNR details.' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});