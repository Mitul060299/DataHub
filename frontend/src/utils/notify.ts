import { message } from "antd";

export const notify = {
  success: (text: string) => message.success(text),
  error: (text: string) => message.error(text),
  info: (text: string) => message.info(text)
};
