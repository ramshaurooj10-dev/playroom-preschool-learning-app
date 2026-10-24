export default function handler(req: any, res: any) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() }));
}
