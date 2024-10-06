require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/pnr/:pnrNumber', async (req, res) => {
  const { pnrNumber } = req.params;
  
  // Check if the environment is local
  const isLocalEnv = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'local';

  if (isLocalEnv && pnrNumber === "2802138091") {
    // Mock data for local environment
    const mockData = {
      "success": true,
      "data": {
        "pnrNumber": "2802138091",
        "dateOfJourney": "Oct 29, 2024 4:55:50 PM",
        "trainNumber": "12952",
        "trainName": "MMCT TEJAS RAJ",
        "sourceStation": "NDLS",
        "destinationStation": "MMCT",
        "reservationUpto": "MMCT",
        "boardingPoint": "NDLS",
        "journeyClass": "2A",
        "numberOfpassenger": 1,
        "chartStatus": "Chart Not Prepared",
        "informationMessage": [
          "",
          ""
        ],
        "passengerList": [
          {
            "passengerSerialNumber": 1,
            "passengerFoodChoice": "D",
            "concessionOpted": false,
            "forGoConcessionOpted": false,
            "passengerIcardFlag": false,
            "childBerthFlag": false,
            "passengerNationality": "IN",
            "passengerQuota": "GN",
            "passengerCoachPosition": 0,
            "waitListType": 0,
            "bookingStatusIndex": 0,
            "bookingStatus": "CNF",
            "bookingCoachId": "A5",
            "bookingBerthNo": 41,
            "bookingBerthCode": "SL",
            "bookingStatusDetails": "CNF/A5/41/SL",
            "currentStatusIndex": 0,
            "currentStatus": "CNF",
            "currentCoachId": "",
            "currentBerthNo": 0,
            "currentStatusDetails": "CNF"
          }
        ],
        "timeStamp": "Oct 6, 2024 3:12:50 PM",
        "bookingFare": 3845,
        "ticketFare": 3845,
        "quota": "GN",
        "reasonType": "S",
        "ticketTypeInPrs": "E",
        "waitListType": 0,
        "bookingDate": "Sep 10, 2024 12:00:00 AM",
        "arrivalDate": "Oct 7, 2024 8:35:50 AM",
        "mobileNumber": "",
        "distance": 1384,
        "isWL": "N"
      },
      "generatedTimeStamp": Date.now()
    };

    // Return the mock data for local environment
    return res.json(mockData);
  } else {
    // Production environment: Make the actual API call using Axios
    try {
      const response = await axios.get(`https://irctc-indian-railway-pnr-status.p.rapidapi.com/getPNRStatus/${pnrNumber}`, {
        headers: {
          'x-rapidapi-key': process.env.RAPIDAPI_KEY,
          'x-rapidapi-host': 'irctc-indian-railway-pnr-status.p.rapidapi.com'
        }
      });
      res.json(response.data);
    } catch (error) {
      console.error('Error fetching PNR data:', error);
      res.status(500).json({ success: false, message: 'Error fetching PNR data' });
    }
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});