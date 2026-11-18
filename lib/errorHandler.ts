export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  userMessage: string;
}

/**
 * Safely executes asynchronous database actions and returns a clean response
 * without crashing or exposing raw database exceptions to the UI.
 */
export async function safeExecute<T>(
  action: () => Promise<T>,
  fallbackMessage = "Something went wrong. Please try again."
): Promise<ActionResponse<T>> {
  try {
    const data = await action();
    return {
      success: true,
      data,
      userMessage: "Success",
    };
  } catch (error: any) {
    // Log detailed technical information on the server side for debugging
    console.error("[Production Error Log]:", {
      message: error?.message || error,
      code: error?.code,
      details: error?.details,
      timestamp: new Date().toISOString(),
    });

    let userMessage = fallbackMessage;

    // Map common PostgreSQL error codes to clear, friendly messages
    if (error?.code === '23502') {
      userMessage = "Required fields are missing. Please fill in all details.";
    } else if (error?.code === '23505') {
      userMessage = "This entry or handle already exists. Please choose another.";
    } else if (error?.code === '42501' || error?.message?.includes('row-level security')) {
      userMessage = "Permission denied. Please check your account session.";
    }

    return {
      success: false,
      userMessage,
    };
  }
}