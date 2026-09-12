export interface ToolSuccess<T> {
  success: true;
  data: T;
}

export interface ToolFailure {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

export function toolSuccess<T>(data: T): ToolSuccess<T> {
  return {
    success: true,
    data,
  };
}

export function toolFailure(code: string, message: string): ToolFailure {
  return {
    success: false,
    error: {
      code,
      message,
    },
  };
}
