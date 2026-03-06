/**
 * Test Infobip SMS sending
 * Run: npx tsx scripts/test-sms.ts
 */
import "dotenv/config";

async function main() {
  const baseUrl = process.env.INFOBIP_API_URL;
  const apiKey = process.env.INFOBIP_API_KEY;

  if (!baseUrl || !apiKey) {
    console.error("INFOBIP_API_URL and INFOBIP_API_KEY must be set");
    process.exit(1);
  }

  console.log("Testing Infobip SMS...");
  console.log("API URL:", baseUrl);
  console.log("API Key:", apiKey.substring(0, 10) + "...");

  const url = `${baseUrl.replace(/\/+$/, "")}/sms/2/text/advanced`;

  const body = {
    messages: [
      {
        destinations: [{ to: "971586166310" }],
        from: "ORA",
        text: `ORA Events - SMS Test\n\nThis is a test SMS sent via Infobip to verify the connection works.\n\nSent at: ${new Date().toISOString()}`,
      },
    ],
  };

  console.log("Sending to: 971563041518");
  console.log("Request URL:", url);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `App ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  console.log("Response status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (response.ok && data.messages?.[0]?.status?.groupName === "PENDING") {
    console.log("SMS sent successfully! Message ID:", data.messages[0].messageId);
  } else {
    console.log("SMS may have failed. Check response above.");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
