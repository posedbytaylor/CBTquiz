// Netlify Function: submit-quiz
// Receives the quiz submission from index.html, adds the contact to Brevo,
// and sends Taylor an email notification with the lead's details + result.
//
// Required environment variables (set these in Netlify, NOT in this file):
//   BREVO_API_KEY   - your Brevo API key (Settings > SMTP & API > API Keys)
//   BREVO_LIST_ID    - the numeric ID of the Brevo list to add contacts to
//   NOTIFY_EMAIL     - the email address that should receive lead notifications (Taylor's inbox)
//   FROM_EMAIL       - a verified sender email address in Brevo (Settings > Senders)

const RESULT_LABELS = {
  diet: "Diet",
  perfectionist: "The Perfectionist Mindset",
  training: "Training Structure",
  routine: "Lack of Routine",
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { fullName, instagram, email, result } = payload;

  if (!fullName || !instagram || !email || !result) {
    return { statusCode: 400, body: "Missing required fields" };
  }

  const apiKey = process.env.BREVO_API_KEY;
  const listId = process.env.BREVO_LIST_ID;
  const notifyEmail = process.env.NOTIFY_EMAIL;
  const fromEmail = process.env.FROM_EMAIL;

  if (!apiKey || !listId || !notifyEmail || !fromEmail) {
    console.error("Missing required environment variables");
    return { statusCode: 500, body: "Server not configured" };
  }

  const resultLabel = RESULT_LABELS[result] || result;

  try {
    // 1. Add / update the contact in Brevo
    const contactRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        attributes: {
          FULLNAME: fullName,
          INSTAGRAM: instagram,
          QUIZ_RESULT: resultLabel,
        },
        listIds: [Number(listId)],
        updateEnabled: true,
      }),
    });

    if (!contactRes.ok) {
      const errText = await contactRes.text();
      console.error("Brevo contact error:", errText);
      // Continue anyway so the person still sees their result -
      // but log this so Taylor can check Brevo if leads go missing.
    }

    // 2. Notify Taylor by email so she can prep the PDF + Loom follow-up
    const notifyRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: "CBT Quiz" },
        to: [{ email: notifyEmail }],
        subject: `New quiz lead: ${fullName} — ${resultLabel}`,
        htmlContent: `
          <h2>New quiz submission</h2>
          <p><strong>Name:</strong> ${fullName}</p>
          <p><strong>Instagram:</strong> ${instagram}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Result:</strong> ${resultLabel}</p>
        `,
      }),
    });

    if (!notifyRes.ok) {
      const errText = await notifyRes.text();
      console.error("Brevo notification email error:", errText);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("submit-quiz function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: "Something went wrong" }),
    };
  }
};
