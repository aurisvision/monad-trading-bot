# Feedback System Admin Notifications

## Overview
The feedback system now includes automatic admin notifications. When users submit feedback through the bot, the admin will receive a detailed notification message in their Telegram chat.

## Setup Instructions

### 1. Configure Admin User ID
The system uses the existing `ADMIN_USER_ID` environment variable:

```bash
ADMIN_USER_ID=6920475855
```

### 2. How to Get Your Telegram User ID
1. Start a chat with [@userinfobot](https://t.me/userinfobot) on Telegram
2. Send any message to the bot
3. The bot will reply with your user information including your User ID
4. Copy the User ID number and use it as the `ADMIN_USER_ID` value

### 3. Admin Notification Format
When a user submits feedback, the admin will receive a message like this:

```
🔔 NEW FEEDBACK RECEIVED

🐛 Type: BUG

👤 User Details:
• Name: John Doe
• Username: @johndoe
• User ID: 123456789

💬 Feedback Message:
The bot is not responding to my commands properly.

📊 Details:
• Feedback ID: 42
• Timestamp: 10/6/2025, 10:29:10 PM
• Status: NEW

---
This feedback has been automatically stored in the database.
```

### 4. Feedback Types
The system supports three types of feedback:
- 🐛 **Bug Report** - Technical issues and problems
- 💡 **Suggestion** - Feature requests and improvements
- 💭 **General Feedback** - Overall user experience

### 5. Database Storage
All feedback is automatically stored in the `feedback` table with the following information:
- User ID, username, and first name
- Feedback type and content
- Timestamp and status
- Unique feedback ID for tracking

### 6. Error Handling
If the admin notification fails to send:
- The feedback is still stored in the database
- An error is logged for debugging
- The user's feedback submission is not affected

## Important Notes
- If `ADMIN_USER_ID` is not configured, feedback will still be stored but no notifications will be sent
- Admin notifications are sent using Telegram's bot API
- All feedback data is stored in the PostgreSQL database for future reference