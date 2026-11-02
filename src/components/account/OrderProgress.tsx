import { Check, Circle } from "lucide-react";
import { getOrderProgress, orderProgressSteps } from "@/lib/order-progress";

export default function OrderProgress({ status }: { status: string }) {
  const progress = getOrderProgress(status);

  if (progress.cancelled) {
    return <p className="order-progress-cancelled" role="status">This order was cancelled. Contact our team if you need help.</p>;
  }

  return (
    <ol className="order-progress" aria-label="Order progress">
      {orderProgressSteps.map((label, index) => {
        const complete = index < progress.completedSteps;
        const current = index === progress.activeStep;

        return (
          <li
            key={label}
            className={`order-progress-step${complete ? " is-complete" : ""}${current ? " is-current" : ""}`}
            aria-current={current ? "step" : undefined}
          >
            <span className="order-progress-marker" aria-hidden="true">
              {complete ? <Check size={12} strokeWidth={2.5} /> : <Circle size={10} strokeWidth={2} />}
            </span>
            <span className="order-progress-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
