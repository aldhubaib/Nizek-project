/** Railway cron: POST daily deadline reminders on the main app. */
const url =
  process.env.CRON_URL?.trim() ??
  "https://panel.nizek.com/api/cron/deadline-reminders";
const secret = process.env.CRON_SECRET?.trim();

if (!secret) {
  console.error("CRON_SECRET is not set");
  process.exit(1);
}

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  },
});

const body = await res.text();
console.log(`POST ${url} → ${res.status}`);
console.log(body);

if (!res.ok) process.exit(1);
