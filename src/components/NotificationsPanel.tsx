"use client";

import { useEffect, useState } from "react";

interface Item {
  id: string;
  type: "new_lead" | "abandoned_lead";
  leadId: string | null;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationsPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/builder/notifications");
      if (res.ok) {
        const data = (await res.json()) as { items: Item[]; unread: number };
        setItems(data.items);
        setUnread(data.unread);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function markRead() {
    await fetch("/api/builder/notifications", { method: "POST" });
    void load();
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">
          Notifications {unread > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 text-xs text-white">{unread}</span>}
        </h3>
        {unread > 0 && (
          <button onClick={markRead} className="text-xs text-brand hover:underline">Mark all read</button>
        )}
      </div>
      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-slate-400">No notifications yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.slice(0, 8).map((n) => (
            <li key={n.id} className={`rounded border p-2 ${n.read ? "border-slate-100" : "border-cyan-200 bg-cyan-50"}`}>
              <a href={n.leadId ? `/builder/leads/${n.leadId}` : "/builder/leads"} className="block">
                <span className="font-medium text-slate-800">{n.title}</span>
                <span className="block text-xs text-slate-500">{n.body}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
