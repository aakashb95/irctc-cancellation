"use client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import axios from 'axios';
import { differenceInHours, format, isBefore, parse, subHours } from 'date-fns';
import React, { useEffect, useState } from 'react';
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { paymentMethods, calculateRefundAmount, PaymentMethod, calculatePaymentCharges } from "@/utils/paymentCalculations";

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
    bookingStatusDetails: string;
    currentStatusDetails: string;
  }[];
  bookingDate: string;
}

interface CancellationScenario {
  description: string;
  charge: string;
  refund: string;
  pgCharges: string;
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
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>(paymentMethods[0]);

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
    setPnrData(null);
    setIsLoading(true);

    const baseUrl = process.env.NODE_ENV === 'development'
      ? 'http://localhost:3001'
      : 'https://irctc-cancellation.onrender.com';

    try {
      const response = await axios.get(`${baseUrl}/api/pnr/${pnr}`);
      if (response.data.success) {
        setPnrData(response.data.data);
        calculateCancellationScenarios(response.data.data);
      } else {
        setError(response.data.message || "Failed to fetch PNR details. Please try again.");
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        setError(error.response.data.message || "An error occurred while fetching PNR details.");
      } else {
        setError("An error occurred while fetching PNR details.");
      }
    } finally {
      setIsLoading(false);
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

      const initialRefund = Math.max(0, fare - charge); // Ensure refund is not negative
      const pgCharges = calculatePaymentCharges(fare, selectedPaymentMethod);

      scenarios.push({
        description,
        charge: charge.toFixed(2),
        refund: initialRefund.toFixed(2),
        pgCharges: pgCharges.toFixed(2),
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

  const sortCancellationScenarios = (scenarios: CancellationScenario[]): CancellationScenario[] => {
    return scenarios.sort((a, b) => {
      if (a.isBestTime) return -1;
      if (b.isBestTime) return 1;
      if (a.isPast && !b.isPast) return 1;
      if (!a.isPast && b.isPast) return -1;
      return parseFloat(b.refund) - parseFloat(a.refund);
    });
  };

  const updateRefundAmounts = (paymentMethod: PaymentMethod) => {
    if (!pnrData) return;

    const updatedScenarios = cancellationScenarios.map(scenario => {
      const fare = pnrData.bookingFare;
      const charge = parseFloat(scenario.charge);
      const pgCharges = calculatePaymentCharges(fare, paymentMethod);
      const refund = Math.max(0, calculateRefundAmount(fare, charge, paymentMethod));
      return {
        ...scenario,
        refund: refund.toFixed(2),
        pgCharges: pgCharges.toFixed(2)
      };
    });

    // Sort the scenarios after updating the refund amounts
    const sortedScenarios = sortCancellationScenarios(updatedScenarios);
    setCancellationScenarios(sortedScenarios);
  };

  useEffect(() => {
    if (pnrData) {
      updateRefundAmounts(selectedPaymentMethod);
    }
  }, [selectedPaymentMethod, pnrData]);

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

  const formatDate = (dateString: string) => {
    const parsedDate = parse(dateString, 'MMM d, yyyy h:mm:ss a', new Date());
    return format(parsedDate, 'yyyy-MM-dd HH:mm');
  };

  return (
    <div className="p-2 sm:p-4 max-w-6xl mx-auto">
      <div className="space-y-4">
        <div className="flex flex-col space-y-2">
          <Input
            type="text"
            placeholder="Enter PNR number"
            value={pnr}
            onChange={(e) => setPnr(e.target.value)}
            className="w-full"
            disabled={isLoading}
          />
          <Button
            onClick={fetchPnrDetails}
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              'Fetch PNR Details'
            )}
          </Button>
        </div>

        {pnrData && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-lg shadow">
              <h2 className="text-xl font-bold mb-4">PNR Details</h2>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <p className="font-semibold">PNR Number:</p>
                <p>{pnrData.pnrNumber}</p>

                <p className="font-semibold">Train:</p>
                <p>{`${pnrData.trainName} (${pnrData.trainNumber})`}</p>

                <p className="font-semibold">Date of Journey:</p>
                <p>{formatDate(pnrData.dateOfJourney)}</p>

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
                  <div key={index} className="ml-4 mb-2 text-sm">
                    <p className="font-medium">Passenger {passenger.passengerSerialNumber}:</p>
                    <p className="ml-4">Booking Status: {passenger.bookingStatus}</p>
                    <p className="ml-4">Current Status: {passenger.currentStatus}</p>
                  </div>
                ))}
              </div>
            </div>

            {cancellationScenarios.length > 0 && (
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4">
                  <h2 className="text-xl font-bold mb-2 sm:mb-0">Cancellation Scenarios</h2>
                  <Select
                    value={selectedPaymentMethod.name}
                    onValueChange={(value) => setSelectedPaymentMethod(paymentMethods.find(m => m.name === value) || paymentMethods[0])}
                  >
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Payment Method" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((method) => (
                        <SelectItem key={method.name} value={method.name}>
                          {method.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-4 text-sm">
                  <p className="font-semibold">
                    {getBestCancellationAdvice(
                      parse(pnrData.bookingDate, 'MMM d, yyyy h:mm:ss a', new Date()),
                      parse(pnrData.dateOfJourney, 'MMM d, yyyy h:mm:ss a', new Date())
                    )}
                  </p>

                  {cancellationScenarios.map((scenario, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded mb-4 ${scenario.isBestTime
                        ? 'bg-green-100 border-2 border-green-500'
                        : scenario.isPast
                          ? 'bg-gray-300'
                          : 'bg-gray-100'
                        }`}
                    >
                      <p className="font-semibold mb-2">
                        <strong>{scenario.description}</strong>
                        {scenario.isBestTime && (
                          <span className="ml-2 text-green-600 font-bold">
                            (Best time to cancel)
                          </span>
                        )}
                      </p>
                      <p className="mb-1">Date & Time: {format(scenario.dateTime, 'dd-MM-yyyy HH:mm')}</p>
                      <p className="mb-1">Estimated Cancellation Charge: ₹{scenario.charge}</p>
                      <p className="mb-1">Estimated PG Charges: ₹{scenario.pgCharges}</p>
                      <p className="mb-1">
                        Estimated Refund Amount: <span className="font-bold">₹{scenario.refund}</span>
                      </p>
                      {scenario.isPast && <p className="text-red-500 mt-2">This time has passed</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription className="text-red-600 font-semibold">{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
};

export default IRCTCCancellationCalculator;