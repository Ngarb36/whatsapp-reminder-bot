# הוראות הגדרה – Finance Tracker

## שלב 1 – התקנת Node.js (פעם אחת בלבד)
אם עוד לא מותקן:
1. לך ל: https://nodejs.org
2. הורד את הגרסה **LTS** ותתקין

---

## שלב 2 – יצירת Google Cloud Project

1. לך ל: https://console.cloud.google.com
2. לחץ על **"Select a project"** ← **"New Project"**
3. תן שם לפרויקט (לדוגמה: "Finance Tracker") ← **Create**

### הפעל את Google Sheets API:
4. בתפריט השמאלי: **APIs & Services** ← **Library**
5. חפש "Google Sheets API" ← **Enable**

### צור credentials:
6. **APIs & Services** ← **Credentials**
7. לחץ **"+ Create Credentials"** ← **OAuth client ID**
8. אם מבקש: לחץ **"Configure Consent Screen"**
   - בחר **External** ← **Create**
   - מלא App name: "Finance Tracker"
   - User support email: האימייל שלך
   - Developer contact: האימייל שלך
   - לחץ **Save and Continue** בכל שלב עד לסוף
   - בשלב **Test users** – הוסף את האימייל שלך ← **Save**
9. חזור ל-**Credentials** ← **+ Create Credentials** ← **OAuth client ID**
10. Application type: **Web application**
11. Name: "Finance Tracker"
12. תחת **Authorized redirect URIs** – לחץ **Add URI** והוסף:
    ```
    http://localhost:3000/api/auth/callback/google
    ```
13. לחץ **Create**
14. תראה חלון עם **Client ID** ו-**Client Secret** – העתק אותם!

---

## שלב 3 – הגדרת ה-App

1. פתח את תיקיית הפרויקט ב-Terminal
2. צור קובץ `.env.local` (העתק מ-`.env.example`):

```bash
cp .env.example .env.local
```

3. פתח את `.env.local` ומלא:
```
GOOGLE_CLIENT_ID=<מה שהעתקת מ-Google Cloud>
GOOGLE_CLIENT_SECRET=<מה שהעתקת מ-Google Cloud>
NEXTAUTH_SECRET=abc123xyz789somethingRandom
NEXTAUTH_URL=http://localhost:3000
```

---

## שלב 4 – הרצה

בטרמינל (בתיקיית הפרויקט):

```bash
npm install
npm run dev
```

פתח דפדפן: **http://localhost:3000**

---

## שלב 5 – שימוש

1. לחץ "התחבר עם Google"
2. בחר את חשבון ה-Google שיש לו גישה לגיליון
3. אשר את ההרשאות
4. הנה! רואה את הנתונים שלך 🎉

**עריכה**: לחץ על כל תא לעריכה ישירה – השינויים יישמרו ל-Google Sheets אוטומטית.

---

## פתרון בעיות

**"Error 403"** – בדוק שהוספת את האימייל שלך ב-Test Users ב-Google Cloud Console

**"Unauthorized"** – בדוק שה-Client ID וה-Secret ב-.env.local נכונים

**לא רואה נתונים** – בדוק שהתחברת עם אותו Google Account שיש לו גישה לגיליון
