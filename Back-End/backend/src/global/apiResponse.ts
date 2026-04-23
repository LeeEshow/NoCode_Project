export const ApiResponse = {
  success: (data: unknown) => ({ success: true, data }),
  error:   (message: string) => ({ success: false, error: message }),
};
