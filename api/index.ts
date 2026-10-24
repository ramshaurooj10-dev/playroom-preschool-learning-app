import approveHandler from "./payment/school-request/approve";
import requestsHandler from "./payment/school-requests";
import healthHandler from "./health";

export default async function handler(req: any, res: any) {
  const url = req.url || "";

  if (url.includes("/api/payment/school-request/approve")) {
    return approveHandler(req, res);
  }
  if (url.includes("/api/payment/school-requests")) {
    return requestsHandler(req, res);
  }
  if (url.includes("/api/health")) {
    return healthHandler(req, res);
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ status: "API Gateway active", url }));
}
