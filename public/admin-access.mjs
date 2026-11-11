export const OWNER_EMAIL='cyber924@naver.com';
export const INITIAL_ADMIN_EMAILS=[OWNER_EMAIL,'moadmin1@naver.com','moadmin2@naver.com'];
export const isInitialAdmin=email=>INITIAL_ADMIN_EMAILS.includes(email);
