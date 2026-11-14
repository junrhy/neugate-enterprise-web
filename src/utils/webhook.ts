import { invoke } from "@tauri-apps/api/core";

export interface WebhookEventPayload {
  event: string;
  timestamp: string;
  company_name?: string;
  school_name?: string;
  license_key?: string;
  machine_fingerprint?: string;
  data: Record<string, any>;
}

/**
 * Sends a webhook payload to the user's configured automation URL (n8n, Zapier, Make, etc.)
 */
export async function sendWebhookEvent(event: string, data: Record<string, any> = {}): Promise<boolean> {
  try {
    const webhookEnabled = localStorage.getItem("neugate_dev_webhook_enabled") === "true";
    if (!webhookEnabled) {
      return false;
    }

    const webhookUrl = localStorage.getItem("neugate_dev_webhook_url") || "";
    if (!webhookUrl || !webhookUrl.trim()) {
      return false;
    }

    const licenseKey = localStorage.getItem("neugate_license_key") || undefined;
    const companyName = localStorage.getItem("neugate_school_name") || "Acme Corporation";
    const fingerprint = await invoke<string>("get_machine_fingerprint").catch(() => undefined);

    const payload: WebhookEventPayload = {
      event,
      timestamp: new Date().toISOString(),
      company_name: companyName,
      school_name: companyName,
      license_key: licenseKey,
      machine_fingerprint: fingerprint,
      data,
    };

    const res = await fetch(webhookUrl.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    return res.ok;
  } catch (err) {
    console.error(`[Webhook] Failed to send event "${event}":`, err);
    return false;
  }
}
