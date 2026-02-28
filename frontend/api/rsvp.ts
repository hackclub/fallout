export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ message: 'Method not allowed' }, { status: 405 });
  }

  const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID } = process.env;

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
    return Response.json({ message: 'Server configuration error' }, { status: 500 });
  }

  const formData = await req.formData();
  const emailRaw = formData.get('Email');

  if (typeof emailRaw !== 'string' || !emailRaw.trim()) {
    return Response.json({ message: 'Email is required' }, { status: 400 });
  }

  const email = emailRaw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ message: 'Invalid email' }, { status: 400 });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '';

  const fields = {
    Email: email,
    'IP Address': ip,
  };

  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_ID)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      }
    );

    if (!response.ok) {
      console.error('Airtable error:', response.status, await response.text());
      return Response.json({ message: 'Submission failed' }, { status: 502 });
    }

    const data = await response.json();
    return Response.json({ success: true, id: data.id });
  } catch (e) {
    console.error('RSVP handler failed:', e);
    return Response.json({ message: 'Internal error' }, { status: 500 });
  }
}
