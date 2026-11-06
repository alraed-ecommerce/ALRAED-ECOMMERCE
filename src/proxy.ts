import { NextRequest, NextResponse } from "next/server";

function acceptsMarkdown(acceptHeader: string) {
  return acceptHeader.split(",").some((mediaRange) => {
    const [mediaType, ...parameters] = mediaRange.trim().toLowerCase().split(";");
    if (mediaType !== "text/markdown") return false;
    const quality = parameters.find((parameter) => parameter.trim().startsWith("q="));
    return !quality || Number(quality.trim().slice(2)) > 0;
  });
}

function addVaryAccept(headers: Headers) {
  const values = (headers.get("Vary") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!values.some((value) => value.toLowerCase() === "accept") && !values.includes("*")) {
    values.push("Accept");
    headers.set("Vary", values.join(", "));
  }
}

export function proxy(request: NextRequest) {
  const destination = acceptsMarkdown(request.headers.get("accept") ?? "")
    ? new URL("/index.md", request.url)
    : null;
  const response = destination
    ? NextResponse.rewrite(destination)
    : NextResponse.next();

  response.headers.append(
    "Link",
    `<${new URL("/llms.txt", request.url).toString()}>; rel="describedby"; type="text/plain"`,
  );
  response.headers.append(
    "Link",
    `<${new URL("/index.md", request.url).toString()}>; rel="alternate"; type="text/markdown"`,
  );
  addVaryAccept(response.headers);
  return response;
}

export const config = {
  matcher: "/",
};
