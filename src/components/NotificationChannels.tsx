"use client";

import { useState } from "react";

/** Notification channels panel (§8 item 4): Slack URL + per-channel test sends. */
export default function NotificationChannels({
  slackEnabled,
  smsEnabled,
  initialSlackUrl,
}: {
  slackEnabled: boolean;
  smsEnabled: boolean;
  initialSlackUrl: string | null;
}) {
  const [slackUrl, setSlackUrl] = useState(initialSlackUrl ?? "");
  const [status, setStatus] = useState<string | null>(null);

  async function saveSlack() {
    setStatus(null);
    const res = await fetch("/api/builder/channels", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slackWebhookUrl: slackUrl }),
    });
    setStatus(res.ok ? "Slack saved." : "Could not save (Pro+ required).");
  }
  async function testSend(channel: "email" | "slack" | "sms", to?: string) {
    setStatus(null);
    const res = await fetch("/api/builder/channels", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, to }),
    });
    const data = (await res.json()) as { ok?: boolean; transport?: string };
    setStatus(res.ok ? `Sent via ${channel} (${data.transport}).` : `${channel} not available on your plan.`);
  }

  return (
    <div className="space-y-3 text-sm">
      <div>
        <span className="text-slate-600">Email</span>
        <button onClick={() => testSend("email")} className="ml-2 rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100">Test email</button>
      </div>

      <div className={slackEnabled ? "" : "opacity-50"}>
        <label className="block">
          <span className="text-slate-600">Slack incoming webhook {slackEnabled ? "" : "(Pro+)"}</span>
          <input className="inp mt-0.5" disabled={!slackEnabled} value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" />
        </label>
        <div className="mt-1 flex gap-2">
          <button onClick={saveSlack} disabled={!slackEnabled} className="rounded bg-brand px-2 py-0.5 text-xs font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">Save</button>
          <button onClick={() => testSend("slack")} disabled={!slackEnabled} className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-50">Test Slack</button>
        </div>
      </div>

      <div className={smsEnabled ? "" : "opacity-50"}>
        <span className="text-slate-600">SMS (Twilio) {smsEnabled ? "" : "(Premium)"}</span>
        <p className="text-xs text-slate-400">Configured via TWILIO_* env. Test sends to a number you enter below.</p>
        <SmsTest enabled={smsEnabled} onTest={(to) => testSend("sms", to)} />
      </div>

      {status && <p className="text-xs text-emerald-700">{status}</p>}
    </div>
  );
}

function SmsTest({ enabled, onTest }: { enabled: boolean; onTest: (to: string) => void }) {
  const [to, setTo] = useState("");
  return (
    <div className="mt-1 flex gap-2">
      <input className="inp" disabled={!enabled} value={to} onChange={(e) => setTo(e.target.value)} placeholder="+15555550123" />
      <button onClick={() => onTest(to)} disabled={!enabled || !to} className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-50">Test SMS</button>
    </div>
  );
}
