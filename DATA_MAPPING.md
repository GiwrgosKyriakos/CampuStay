# CampuStay - Data Mapping (Internal Use)

1. DATA COLLECTED DIRECTLY FROM USER:
- Account Credentials: Email (Processed via Firebase Auth).
- Profile Info: Name, Age, University, Gender, Photos (Stored in Firestore /users).
- Preference Data: Compatibility Quiz answers (Stored in Firestore /quiz_answers).
- Interaction Data: Likes/Dislikes on profiles & apartments (Stored in /swipes and /liked_apartments).

2. DATA COLLECTED AUTOMATICALLY:
- Device Tokens: Push Notification Tokens (via Expo Notifications, if applicable).

3. THIRD-PARTY DATA PROCESSORS:
- Google Cloud Platform (Firebase Auth, Cloud Firestore, Firebase Storage) - For data hosting and user authentication.
- Expo (Go/App services) - For push notifications delivery and development runtime.

4. DATA RETENTION POLICY:
- All personal data, profile info, quiz responses, and apartment likes are kept active as long as the user account exists.
- Upon executing "Delete Account", all records in /users, /quiz_answers, and /liked_apartments are permanently destroyed. Text messages in /chats remain anonymous under "Noone (Deleted account)" for partner continuity.