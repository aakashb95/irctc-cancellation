"use client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import axios from 'axios';
import { differenceInHours, format, isBefore, parse, subHours } from 'date-fns';
import React, { useEffect, useState } from 'react';

interface PNRData {
  TrainNo: string;
  TrainName: string;
  Doj: string;
  DepartureTime: string;
  From: string;
  To: string;
  Class: string;
  BookingFare: string;
  PassengerStatus: {
    Coach: string;
    Berth: number;
  }[];
  BookingDate: string;
}

interface CancellationScenario {
  description: string;
  charge: string;
  refund: string;
  gst: string;
  dateTime: Date;
  isPast: boolean;
}

const IRCTCCancellationCalculator: React.FC = () => {
  const [pnr, setPnr] = useState('');
  const [pnrData, setPnrData] = useState<PNRData | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cancellationScenarios, setCancellationScenarios] = useState<CancellationScenario[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [departureDateTime, setDepartureDateTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (pnrData) {
      const depDateTime = parse(`${pnrData.Doj} ${pnrData.DepartureTime}`, 'dd-MM-yyyy HH:mm', new Date());
      setDepartureDateTime(depDateTime);
    }
  }, [pnrData]);

  const fetchPnrDetails = async () => {
    setError(null);
    setCancellationScenarios([]);
    
    try {
      const response = await axios.get(`http://localhost:3001/api/pnr/${pnr}`);
      if (response.data.status) {
        setPnrData(response.data.data);
        calculateCancellationScenarios(response.data.data);
      } else {
        setError("Failed to fetch PNR details. Please try again.");
      }
    } catch (error) {
      setError("An error occurred while fetching PNR details.");
    }
  };

  const calculateCancellationScenarios = (data: PNRData) => {
    const departureDateTime = parse(`${data.Doj} ${data.DepartureTime}`, 'dd-MM-yyyy HH:mm', new Date());
    const bookingDateTime = parse(data.BookingDate, 'dd-MM-yyyy', new Date());
    const fare = parseInt(data.BookingFare);
    const scenarios: CancellationScenario[] = [];
    const currentTime = new Date();

    const addScenario = (scenarioTime: Date, description: string) => {
      const timeDiff = differenceInHours(departureDateTime, scenarioTime);
      let charge = 0;
      const classCode = data.Class;
      const flatRate = getFlatRate(classCode);
      const passengerCount = data.PassengerStatus.length;

      console.log(`timeDiff: ${timeDiff}`);
      console.log(`scenarioTime: ${scenarioTime}`);
      console.log(`currentTime: ${currentTime}`);
      console.log(`departureDateTime: ${departureDateTime}`);
      
      if (timeDiff <= 4) {
        charge = fare;
      } else if (timeDiff > 4 && timeDiff <= 12) {
        charge = Math.max(0.5 * fare, flatRate * passengerCount);
      } else if (timeDiff > 12 && timeDiff <= 48) {
        charge = Math.max(0.25 * fare, flatRate * passengerCount);
      } else {
        // 48 hours or more before departure
        charge = flatRate * passengerCount;
      }

      const refund = Math.max(fare - charge, 0);

      scenarios.push({
        description,
        charge: charge.toFixed(2),
        refund: refund.toFixed(2),
        gst: '0.00',
        dateTime: scenarioTime,
        isPast: isBefore(scenarioTime, currentTime)
      });
    };

    const getFlatRate = (classCode: string): number => {
        console.log(classCode);
      const flatRates: { [key: string]: number } = {
        'EC': 240, '1A': 240,
        '2A': 200, 'FC': 200,
        '3A': 180, 'CC': 180, '3E': 180,
        'SL': 120,
        '2S': 60
      };
      return flatRates[classCode] || 60;
    };

    addScenario(subHours(departureDateTime, 4), "Less than 4 hours before departure");
    addScenario(subHours(departureDateTime, 12), "Between 4 and 12 hours before departure");
    addScenario(subHours(departureDateTime, 48), "Between 12 and 48 hours before departure");
    addScenario(subHours(departureDateTime, 72), "48 hours or more before departure");

    setCancellationScenarios(scenarios);
  };

  const getClassFullName = (classCode: string) => {
    const classMap: { [key: string]: string } = {
      'EC': 'Air-Conditioned Executive Chair Class',
      '1A': 'Air-Conditioned First Class',
      '2A': 'Air-Conditioned Two-Tier Class',
      '3A': 'Air-Conditioned Three-Tier Class',
      'CC': 'AC Chair Class',
      'SL': 'Sleeper Class',
      '2S': 'Second Class'
    };
    return classMap[classCode] || classCode;
  };

  const getBestCancellationAdvice = (bookingDateTime: Date, departureDateTime: Date): string => {
    const now = new Date();
    const hoursSinceBooking = differenceInHours(now, bookingDateTime);
    const hoursUntilDeparture = differenceInHours(departureDateTime, now);

    if (isBefore(departureDateTime, now)) {
      return "The train has already departed. Cancellation is not possible.";
    }

    if (hoursSinceBooking <= 24) {
      return "Cancel as soon as possible to get the maximum refund.";
    }

    if (hoursUntilDeparture > 48) {
      return "Cancel soon to minimize cancellation charges.";
    }

    if (hoursUntilDeparture > 12) {
      return "Cancel within the next " + (hoursUntilDeparture - 12) + " hours to avoid higher cancellation charges.";
    }

    if (hoursUntilDeparture > 4) {
      return "Cancel immediately to avoid very high cancellation charges.";
    }

    return "Cancellation will result in minimal or no refund at this point.";
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">IRCTC Cancellation Calculator</h2>
      <div className="space-y-4">
        <Input
          type="text"
          placeholder="Enter PNR number"
          value={pnr}
          onChange={(e) => setPnr(e.target.value)}
        />
        <Button onClick={fetchPnrDetails}>Fetch PNR Details</Button>
        
        {pnrData && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>PNR Details</CardTitle>
              </CardHeader>
              <CardContent>
                <p><strong>Train:</strong> {pnrData.TrainName} ({pnrData.TrainNo})</p>
                <p><strong>Date:</strong> {pnrData.Doj}</p>
                <p><strong>Departure Time:</strong> {pnrData.DepartureTime}</p>
                <p><strong>From:</strong> {pnrData.From}</p>
                <p><strong>To:</strong> {pnrData.To}</p>
                <p><strong>Class:</strong> {getClassFullName(pnrData.Class)}</p>
                <p><strong>Booking Fare:</strong> ₹{pnrData.BookingFare}</p>
                <p><strong>Current Time:</strong> {format(currentTime, 'yyyy-MM-dd HH:mm:ss')}</p>
                <p><strong>Passengers:</strong></p>
                <ul>
                  {pnrData.PassengerStatus.map((passenger, index) => (
                    <li key={index}>
                      Passenger {index + 1}: Coach {passenger.Coach}, Seat {passenger.Berth}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            
            {cancellationScenarios.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Cancellation Scenarios</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 font-semibold">
                    {getBestCancellationAdvice(
                      parse(pnrData.BookingDate, 'dd-MM-yyyy', new Date()),
                      parse(`${pnrData.Doj} ${pnrData.DepartureTime}`, 'dd-MM-yyyy HH:mm', new Date())
                    )}
                  </p>
                  <p className="mb-4">Refund amount reduces at these key points:</p>
                  {cancellationScenarios.map((scenario, index) => (
                    <div key={index} className={`mt-2 p-2 rounded ${scenario.isPast ? 'bg-gray-300' : 'bg-gray-100'}`}>
                      <p><strong>{scenario.description}</strong></p>
                      <p>Date & Time: {format(scenario.dateTime, 'dd-MM-yyyy HH:mm')}</p>
                      <p>Cancellation Charge: ₹{scenario.charge}</p>
                      <p>Refund Amount: ₹{scenario.refund}</p>
                      {scenario.isPast && <p className="text-red-500">This time has passed</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
        
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
};

export default IRCTCCancellationCalculator;