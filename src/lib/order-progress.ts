export const orderProgressSteps = [
  "Order placed",
  "Payment confirmed",
  "Preparing",
  "On the way",
  "Delivered",
] as const;

export type OrderProgress = {
  cancelled: boolean;
  activeStep: number;
  completedSteps: number;
};

export function getOrderProgress(status: string): OrderProgress {
  switch (status.toLowerCase()) {
    case "cancelled":
      return { cancelled: true, activeStep: -1, completedSteps: 0 };
    case "awaiting_payment":
      return { cancelled: false, activeStep: 1, completedSteps: 1 };
    case "paid":
    case "processing":
      return { cancelled: false, activeStep: 2, completedSteps: 2 };
    case "shipped":
      return { cancelled: false, activeStep: 3, completedSteps: 3 };
    case "delivered":
      return { cancelled: false, activeStep: -1, completedSteps: orderProgressSteps.length };
    default:
      return { cancelled: false, activeStep: 0, completedSteps: 0 };
  }
}
