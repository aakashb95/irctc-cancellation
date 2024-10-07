export interface PaymentMethod {
    name: string;
    charges: (amount: number) => number;
}

const calculatePercentage = (amount: number, percentage: number): number => {
    return (amount * percentage) / 100;
};

const calculateFixedCharge = (amount: number, charge: number): number => {
    return charge;
};

export const paymentMethods: PaymentMethod[] = [
    {
        name: "UPI",
        charges: () => 0,
    },
    {
        name: "Debit Card",
        charges: (amount) => {
            if (amount <= 2000) {
                return calculatePercentage(amount, 0.4);
            } else {
                return calculatePercentage(amount, 0.9);
            }
        },
    },
    {
        name: "Credit Card",
        charges: (amount) => calculatePercentage(amount, 1.0),
    },
    {
        name: "Net Banking",
        charges: () => 10,
    },
    {
        name: "E-Wallet",
        charges: (amount) => calculatePercentage(amount, 1.8),
    },
    {
        name: "International Card",
        charges: (amount) => calculatePercentage(amount, 3.5),
    },
    {
        name: "EMI / Pay Later",
        charges: (amount) => calculatePercentage(amount, 3.5),
    },
];

export const calculatePaymentCharges = (amount: number, paymentMethod: PaymentMethod): number => {
    return paymentMethod.charges(amount);
};

export const calculateTotalAmount = (amount: number, paymentMethod: PaymentMethod): number => {
    const charges = calculatePaymentCharges(amount, paymentMethod);
    return amount + charges;
};

export const calculateRefundAmount = (
    totalAmount: number,
    cancellationCharge: number,
    paymentMethod: PaymentMethod
): number => {
    const paymentCharges = calculatePaymentCharges(totalAmount, paymentMethod);
    return totalAmount - cancellationCharge - paymentCharges;
};