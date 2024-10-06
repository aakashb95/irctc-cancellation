"use client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import axios from 'axios';
import { differenceInHours, format, isBefore, parse, subHours } from 'date-fns';
import React, { useEffect, useState } from 'react';

interface PNRData {
  pnrNumber: string;
  dateOfJourney: string;
  trainNumber: string;
  trainName: string;
  sourceStation: string;
  destinationStation: string;
  journeyClass: string;
  bookingFare: number;
  passengerList: {
    passengerSerialNumber: number;
    bookingStatus: string;
    currentStatus: string;
  }[];
  bookingDate: string;
}

interface CancellationScenario {
  description: string;
  charge: string;
  refund: string;
  gst: string;
  dateTime: Date;
  isPast: boolean;
  isBestTime: boolean;
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
      const depDateTime = parse(pnrData.dateOfJourney, 'MMM d, yyyy h:mm:ss a', new Date());
      setDepartureDateTime(depDateTime);
    }
  }, [pnrData]);

  const fetchPnrDetails = async () => {
    setError(null);
    setCancellationScenarios([]);

    try {
      const response = await axios.get(`https://irctc-cancellation.onrender.com/api/pnr/${pnr}`);
      if (response.data.success) {
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
    const departureDateTime = parse(data.dateOfJourney, 'MMM d, yyyy h:mm:ss a', new Date());
    const bookingDateTime = parse(data.bookingDate, 'MMM d, yyyy h:mm:ss a', new Date());
    const fare = data.bookingFare;
    const scenarios: CancellationScenario[] = [];
    const currentTime = new Date();

    const addScenario = (scenarioTime: Date, description: string) => {
      const timeDiff = differenceInHours(departureDateTime, scenarioTime);
      let charge = 0;
      const classCode = data.journeyClass;
      const flatRate = getFlatRate(classCode);
      const passengerCount = data.passengerList.length;

      if (timeDiff <= 4) {
        charge = fare;
      } else if (timeDiff > 4 && timeDiff <= 12) {
        charge = Math.max(0.5 * fare, flatRate * passengerCount);
      } else if (timeDiff > 12 && timeDiff <= 48) {
        charge = Math.max(0.25 * fare, flatRate * passengerCount);
      } else {
        charge = flatRate * passengerCount;
      }

      const refund = Math.max(fare - charge, 0);

      scenarios.push({
        description,
        charge: charge.toFixed(2),
        refund: refund.toFixed(2),
        gst: '0.00',
        dateTime: scenarioTime,
        isPast: isBefore(scenarioTime, currentTime),
        isBestTime: false
      });
    };

    const getFlatRate = (classCode: string): number => {
      const flatRates: { [key: string]: number } = {
        '1A': 240, '2A': 200, '3A': 180, 'CC': 180, 'SL': 120, '2S': 60
      };
      return flatRates[classCode] || 60;
    };

    addScenario(subHours(departureDateTime, 4), "Less than 4 hours before departure");
    addScenario(subHours(departureDateTime, 12), "Between 4 and 12 hours before departure");
    addScenario(subHours(departureDateTime, 48), "Between 12 and 48 hours before departure");
    addScenario(subHours(departureDateTime, 72), "48 hours or more before departure");

    // Determine the best time to cancel
    const futureScenarios = scenarios.filter(s => !s.isPast);
    if (futureScenarios.length > 0) {
      const bestScenario = futureScenarios.reduce((prev, current) =>
        parseFloat(current.refund) > parseFloat(prev.refund) ? current : prev
      );
      bestScenario.isBestTime = true;
    }

    setCancellationScenarios(scenarios);
  };

  const getClassFullName = (classCode: string) => {
    const classMap: { [key: string]: string } = {
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
    <div className="p-2 sm:p-4 max-w-6xl mx-auto">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
          <Input
            type="text"
            placeholder="Enter PNR number"
            value={pnr}
            onChange={(e) => setPnr(e.target.value)}
            className="w-full sm:w-auto sm:flex-grow"
          />
          <Button onClick={fetchPnrDetails} className="w-full sm:w-auto">Fetch PNR Details</Button>
        </div>

        {pnrData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-xl font-bold">PNR Details</CardTitle>
              </CardHeader>
              <CardContent className="text-sm sm:text-base">
                <div className="grid grid-cols-2 gap-y-2">
                  <p className="font-semibold">PNR Number:</p>
                  <p>{pnrData.pnrNumber}</p>

                  <p className="font-semibold">Train:</p>
                  <p>{`${pnrData.trainName} (${pnrData.trainNumber})`}</p>

                  <p className="font-semibold">Date of Journey:</p>
                  <p>{format(parse(pnrData.dateOfJourney, 'yyyy-MM-dd HH:mm', new Date()), 'yyyy-MM-dd HH:mm')}</p>

                  <p className="font-semibold">From:</p>
                  <p>{pnrData.sourceStation}</p>

                  <p className="font-semibold">To:</p>
                  <p>{pnrData.destinationStation}</p>

                  <p className="font-semibold">Class:</p>
                  <p>{getClassFullName(pnrData.journeyClass)}</p>

                  <p className="font-semibold">Booking Fare:</p>
                  <p>₹{pnrData.bookingFare}</p>

                  <p className="font-semibold">Current Time:</p>
                  <p>{format(currentTime, 'yyyy-MM-dd HH:mm:ss')}</p>
                </div>

                <div className="mt-4">
                  <p className="font-semibold mb-2">Passengers:</p>
                  {pnrData.passengerList.map((passenger, index) => (
                    <div key={index} className="ml-4 mb-2">
                      <p className="font-medium">Passenger {passenger.passengerSerialNumber}:</p>
                      <p className="ml-4">Booking Status: {passenger.bookingStatus}</p>
                      <p className="ml-4">Current Status: {passenger.currentStatus}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {cancellationScenarios.length > 0 && (
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Cancellation Scenarios</CardTitle>
                </CardHeader>
                <CardContent className="overflow-y-auto max-h-[60vh] lg:max-h-[calc(100vh-200px)] text-sm sm:text-base">
                  <p className="mb-2 font-semibold">
                    {getBestCancellationAdvice(
                      parse(pnrData.bookingDate, 'MMM d, yyyy h:mm:ss a', new Date()),
                      parse(pnrData.dateOfJourney, 'MMM d, yyyy h:mm:ss a', new Date())
                    )}
                  </p>
                  <p className="mb-4">Refund amount reduces at these key points:</p>
                  {cancellationScenarios.map((scenario, index) => (
                    <div
                      key={index}
                      className={`mt-2 p-2 rounded ${scenario.isPast ? 'bg-gray-300' :
                        scenario.isBestTime ? 'bg-green-100 border-2 border-green-500' : 'bg-gray-100'
                        }`}
                    >
                      <p>
                        <strong>{scenario.description}</strong>
                        {scenario.isBestTime && (
                          <span className="ml-2 text-green-600 font-bold">
                            (Best time to cancel)
                          </span>
                        )}
                      </p>
                      <p>Date & Time: {format(scenario.dateTime, 'dd-MM-yyyy HH:mm')}</p>
                      <p>Cancellation Charge: ₹{scenario.charge}</p>
                      <p>Refund Amount: ₹{scenario.refund}</p>
                      {scenario.isPast && <p className="text-red-500">This time has passed</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
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