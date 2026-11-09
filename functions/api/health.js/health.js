
export async function onRequest(context) {
  try {
    const db = context.env.DB;

    await db.prepare("SELECT 1").first();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Sajjadhub API এবং Database সংযুক্ত হয়েছে!"
      }),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Database connection failed"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
