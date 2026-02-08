# 🎉 EventUs – College Event Management System

EventUs is a full-stack web application designed to simplify and streamline **college event management**.  
It provides **role-based access** for Administrators and Students, ensuring secure event creation, registration, and tracking with a modern **dark-mode UI**.

---

## 🚀 Features

### 👤 Role-Based Access Control (RBAC)
- **Admin**
  - Create, edit, and delete events
  - Upload event posters
  - View registered participants
- **Student**
  - Register for upcoming events
  - View registered and past events

### 🔐 Security & Authentication
- Session-based authentication using **Express Session**
- **Domain-restricted registration**  
  Only emails ending with `@glbitm.ac.in` are allowed
- Secure password handling

### 📅 Smart Event Handling
- Automatic separation of:
  - **Upcoming Events**
  - **Past Events**
- Date-based event filtering for better UX

### 🖼️ Image Uploads
- Event poster uploads using **Multer**
- Images stored in `public/uploads`
- Unique timestamp-based filenames

### 🌙 Modern UI / UX
- Fully responsive **Dark Mode**
- Clean navigation and event cards
- Custom success/error message pages
- Gradient buttons and branded theme

---

## 🛠️ Tech Stack

### Frontend
- EJS (Embedded JavaScript Templates)
- CSS (Modular & Maintainable)
- Dark Mode UI Design

### Backend
- Node.js
- Express.js
- Express Session
- Multer (File Uploads)

### Database
- MySQL

---

## 🧱 Project Architecture
This project follow MVC architecture design .


---
 
 
