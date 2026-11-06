"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { Suspense, useEffect, useRef } from "react";
import { trackEcommerceEvent } from "@/lib/google-analytics";

function PageViewTracker({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previousUrl = useRef("");

  useEffect(() => {
    const url = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;
    if (previousUrl.current === url) return;
    previousUrl.current = url;
    trackEcommerceEvent("page_view", {
      page_path: url,
      page_location: window.location.href,
      page_title: document.title,
      send_to: measurementId,
    });
  }, [measurementId, pathname, searchParams]);

  return null;
}

export default function GoogleAnalytics() {
  const configuredMeasurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;
  if (!configuredMeasurementId || !/^G-[A-Z0-9]+$/.test(configuredMeasurementId)) return null;
  const measurementId = configuredMeasurementId;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(Array.from(arguments))};window.gtag('js',new Date());window.gtag('config','${measurementId}',{send_page_view:false});`}
      </Script>
      <Suspense fallback={null}>
        <PageViewTracker measurementId={measurementId} />
      </Suspense>
    </>
  );
}
