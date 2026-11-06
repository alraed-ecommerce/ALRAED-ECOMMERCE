import { connection } from "next/server";
import HomePageClient from "./HomePageClient";

export default async function HomePage() {
  // Keep the HTML variant uncached because Next's app-router Vary omits Accept for HTML.
  await connection();
  return <HomePageClient />;
}
