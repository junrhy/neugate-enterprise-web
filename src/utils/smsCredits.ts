import { invoke } from "@tauri-apps/api/core";

export interface SmsCreditInfo {
  gateway: "semaphore" | "unisms" | "philsms" | "mobile_gateway" | "webhook" | "pusher" | string;
  credits: number | string | null;
  accountName?: string;
  statusText?: string;
  error?: string;
  checkedAt?: string;
}

export async function checkSemaphoreCredits(apiKey: string): Promise<SmsCreditInfo> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { gateway: "semaphore", credits: null, error: "Missing Semaphore API key" };
  }
  try {
    const res = await fetch(`https://api.semaphore.co/api/v4/account?apikey=${encodeURIComponent(cleanKey)}`);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        gateway: "semaphore",
        credits: null,
        error: `Semaphore API returned HTTP ${res.status}: ${errText || res.statusText}`,
      };
    }
    const data = await res.json();
    const balance = data.credit_balance !== undefined ? data.credit_balance : data.balance;
    return {
      gateway: "semaphore",
      credits: balance !== undefined ? Number(balance) : null,
      accountName: data.account_name || undefined,
      statusText: data.status || "Active",
      checkedAt: new Date().toLocaleTimeString(),
    };
  } catch (err: any) {
    return {
      gateway: "semaphore",
      credits: null,
      error: err.message || "Failed to reach Semaphore API",
    };
  }
}

export async function checkUniSmsCredits(apiKey: string): Promise<SmsCreditInfo> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { gateway: "unisms", credits: null, error: "Missing UniSMS API key" };
  }
  try {
    // Attempt Tauri native invoke first if available in desktop app
    try {
      const resStr = await invoke<string>("get_unisms_account_info", { apiKey: cleanKey });
      const data = JSON.parse(resStr);
      const balance = data.sms_credits ?? data.credits ?? data.balance;
      return {
        gateway: "unisms",
        credits: balance !== undefined ? (typeof balance === "number" ? balance : Number(balance) || balance) : resStr,
        accountName: data.username || data.name || undefined,
        checkedAt: new Date().toLocaleTimeString(),
      };
    } catch {
      // Browser environment fallback
      const res = await fetch("https://unismsapi.com/api/account", {
        headers: {
          Authorization: `Basic ${btoa(cleanKey + ":")}`,
        },
      });
      if (!res.ok) {
        return { gateway: "unisms", credits: null, error: `UniSMS returned HTTP ${res.status}` };
      }
      const data = await res.json();
      const balance = data.sms_credits ?? data.credits ?? data.balance;
      return {
        gateway: "unisms",
        credits: balance !== undefined ? Number(balance) : null,
        checkedAt: new Date().toLocaleTimeString(),
      };
    }
  } catch (err: any) {
    return {
      gateway: "unisms",
      credits: null,
      error: err.message || "Failed to query UniSMS credits",
    };
  }
}

export async function checkPhilSmsCredits(token: string): Promise<SmsCreditInfo> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { gateway: "philsms", credits: null, error: "Missing PhilSMS API token" };
  }
  try {
    let res = await fetch("https://app.philsms.com/api/v3/balance", {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      res = await fetch("https://app.philsms.com/api/v3/profile", {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          Accept: "application/json",
        },
      });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        gateway: "philsms",
        credits: null,
        error: `PhilSMS returned HTTP ${res.status}: ${text || res.statusText}`,
      };
    }

    const json = await res.json();
    const dataObj = json.data || json;
    const balance = dataObj.remaining_balance ?? dataObj.remaining_credits ?? dataObj.balance ?? dataObj.sms_balance;
    return {
      gateway: "philsms",
      credits: balance !== undefined ? Number(balance) : (json.message || "Connected"),
      accountName: dataObj.name || dataObj.email || undefined,
      checkedAt: new Date().toLocaleTimeString(),
    };
  } catch (err: any) {
    return {
      gateway: "philsms",
      credits: null,
      error: err.message || "Failed to reach PhilSMS API",
    };
  }
}

export async function checkActiveGatewayCredits(): Promise<SmsCreditInfo> {
  const gateway = localStorage.getItem("neugate_sms_gateway") || "webhook";

  if (gateway === "semaphore") {
    const key = localStorage.getItem("neugate_semaphore_api_key") || "";
    return await checkSemaphoreCredits(key);
  }
  if (gateway === "unisms") {
    const key = localStorage.getItem("neugate_unisms_api_key") || "";
    return await checkUniSmsCredits(key);
  }
  if (gateway === "philsms") {
    const token = localStorage.getItem("neugate_philsms_token") || "";
    return await checkPhilSmsCredits(token);
  }
  if (gateway === "mobile_gateway") {
    const ip = localStorage.getItem("neugate_mobile_gateway_ip") || "";
    const port = localStorage.getItem("neugate_mobile_gateway_port") || "8080";
    return {
      gateway: "mobile_gateway",
      credits: "Unlimited (Direct SIM)",
      accountName: `Mobile Gateway (${ip}:${port})`,
      checkedAt: new Date().toLocaleTimeString(),
    };
  }
  if (gateway === "pusher") {
    return {
      gateway: "pusher",
      credits: "WebSocket Live Channel",
      accountName: "Pusher Gateway",
      checkedAt: new Date().toLocaleTimeString(),
    };
  }

  return {
    gateway: "webhook",
    credits: "Custom Webhook Endpoint",
    accountName: localStorage.getItem("neugate_sms_webhook") || "Custom Endpoint",
    checkedAt: new Date().toLocaleTimeString(),
  };
}

