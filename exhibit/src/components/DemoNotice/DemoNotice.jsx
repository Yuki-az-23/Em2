/**
 * Shown above the account pages in the light local demo, which has no sign-in
 * service. Telegram participants and wall visitors need no account.
 */
import React from 'react';
import './DemoNotice.css';

export const DemoNotice = () => (
  <p className="demo-notice" role="note">
    בדמו המקומי אין שירות חשבונות. חשבונות, הגדרות וסוכנים דורשים Supabase מלא. הדלת, הסימולטור והקיר עובדים בלי חשבון.
  </p>
);

export default DemoNotice;
