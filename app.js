const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const app = express();
const PORT = 3000;

// --- UPLOAD SETUP ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public', 'uploads')); 
    },
    filename: (req, file, cb) => {
        cb(null, 'event-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- MIDDLEWARE & CONFIGURATION ---
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Essential for handling AJAX POST requests with JSON body (like the like/unlike route)
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'))); 

// --- SESSION SETUP ---
app.use(session({
    secret: 'webslesson',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// --- DATABASE CONNECTION ---
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '*********', 
    database: 'college_events_db'
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        process.exit(1);
    } else {
        console.log('Connected to MySQL Database');
    }
});

// --- AUTH HELPERS (Middleware) ---
function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    // Forbidden status is the source of the 'Cannot GET /admin/create' error when not logged in as admin
    if (req.session.user.role !== 'admin') return res.status(403).send('Forbidden: Admin access required.'); 
    next();
}

// --- 4. ROUTES ---

// HOME PAGE (Event Listing) - UPDATED TO INCLUDE LIKE COUNT
app.get('/', (req, res) => {
    let queryParams = [];
    const currentUserId = req.session.user ? req.session.user.id : 0; // Get User ID if logged in

    // SQL now includes JOIN for event_likes to get COUNT and user's LIKE status
    let sql = `
        SELECT 
            e.id, e.name, e.date, e.venue, e.description, e.image, e.avg_rating, e.rating_count,
            COUNT(l.event_id) AS like_count,
            CASE WHEN EXISTS(SELECT 1 FROM event_likes WHERE user_id = ? AND event_id = e.id) THEN TRUE ELSE FALSE END AS is_liked_by_user
        FROM events e
        LEFT JOIN event_likes l ON e.id = l.event_id
    `;
    
    // Add the current user ID to queryParams *first* for the CASE WHEN clause
    queryParams.push(currentUserId); 

    if (req.query.search) {
        // Use e.name and e.description due to the JOIN
        sql += ` WHERE e.name LIKE ? OR e.description LIKE ?`;
        const searchTerm = `%${req.query.search}%`;
        queryParams.push(searchTerm);
        queryParams.push(searchTerm);
    }

    // IMPORTANT: Group By clause for COUNT and JOIN to work correctly
    sql += `
        GROUP BY 
            e.id, e.name, e.date, e.venue, e.description, e.image, e.avg_rating, e.rating_count
    `;

    sql += ' ORDER BY date ASC';
    
    db.query(sql, queryParams, (err, results) => {
        if (err) throw err;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const upcomingEvents = [];
        const pastEvents = [];

        results.forEach(event => {
            const eventDate = new Date(event.date);
            eventDate.setHours(0, 0, 0, 0);

            if (eventDate >= today) {
                upcomingEvents.push(event);
            } else {
                pastEvents.push(event);
            }
        });

        res.render('index', {
            upcomingEvents: upcomingEvents,
            pastEvents: pastEvents,
            user: req.session.user,
            searchQuery: req.query.search
        });
    });
});

// SHOW REGISTER PAGE
app.get('/register', (req, res) => {
    res.render('register');
});


// HANDLE REGISTRATION
const REQUIRED_DOMAIN = '@glbitm.ac.in'; 
app.post('/register', (req, res) => {
    const { fullname, email, password } = req.body;

    if (!email.endsWith(REQUIRED_DOMAIN)) {
        return res.render('message', {
            title: 'GL Bajaj Students Only', 
            icon: '🎓',
            message: `This portal is restricted to GLBITM students. You must use your official college email (ending in ${REQUIRED_DOMAIN}).`,
            linkText: 'Try Again',
            linkUrl: '/register'
        });
    }

    const checkSql = 'SELECT * FROM users WHERE email = ?';
    db.query(checkSql, [email], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            return res.render('message', {
                title: 'Email Taken',
                icon: '⚠️',
                message: 'A user with this email address already exists.',
                linkText: 'Login Instead',
                linkUrl: '/login'
            });
        }

        const insertSql = 'INSERT INTO users (fullname, email, password, role) VALUES (?, ?, ?, "student")';
        db.query(insertSql, [fullname, email, password], (err, result) => {
            if (err) {
                console.log(err);
                return res.send('Error registering.');
            }
            res.redirect('/login');
        });
    });
});

// SHOW LOGIN PAGE
app.get('/login', (req, res) => {
    res.render('login');
});

// HANDLE LOGIN 
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const sql = 'SELECT * FROM users WHERE email = ? AND password = ?';

    db.query(sql, [email, password], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            // CRITICAL STEP: Store the user object (must contain role='admin' for admin login)
            req.session.user = results[0]; 
            res.redirect('/');
        } else {
            res.render('message', {
                title: 'Login Failed',
                icon: '❌',
                message: 'Invalid email or password. Please try again.',
                linkText: 'Try Again',
                linkUrl: '/login'
            });
        }
    });
});

// FORGOT PASSWORD ROUTES
app.get('/forgot-password', (req, res) => res.render('forgot'));
app.post('/forgot-password', (req, res) => {
    const { email } = req.body;
    const sql = 'SELECT * FROM users WHERE email = ?';
    
    db.query(sql, [email], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            res.render('message', {
                title: 'Check Your Email',
                icon: '📧',
                message: `We have sent a password reset link to ${email}. Please check your inbox (and spam folder).`,
                linkText: 'Back to Login',
                linkUrl: '/login'
            });
        } else {
            res.render('message', {
                title: 'User Not Found',
                icon: '🔍',
                message: 'We could not find an account with that email address.',
                linkText: 'Try Again',
                linkUrl: '/forgot-password'
            });
        }
    });
});


// LOGOUT
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) throw err;
        res.redirect('/');
    });
});

// --- ADMIN FEATURES ---

// SHOW "ADD EVENT" FORM (Core Feature)
app.get('/admin/create', requireAdmin, (req, res) => { 
    res.render('create');
});

// SAVE NEW EVENT (With Image Upload)
app.post('/admin/create', requireAdmin, upload.single('image'), (req, res) => { 
    const { name, date, venue, description } = req.body;
    const image = req.file ? req.file.filename : 'default.jpg'; 

    const sql = 'INSERT INTO events (name, date, venue, description, image) VALUES (?, ?, ?, ?, ?)';
    
    db.query(sql, [name, date, venue, description, image], (err, result) => {
        if (err) {
            console.error("SQL INSERT Error on /admin/create:", err); 
            return res.status(500).send('Event creation failed due to a database error. Check server console.');
        }
        res.redirect('/');
    });
});


// DELETE EVENT (Protected: Admin Only)
app.post('/delete-event', requireAdmin, (req, res) => {
    const { event_id } = req.body;
    
    // Delete Registrations first (Foreign Key requirement)
    const deleteRegSql = 'DELETE FROM registrations WHERE event_id = ?';
    db.query(deleteRegSql, [event_id], (err, result) => {
        if (err) throw err;
        // In a complete system, you'd also need to delete records from the new 'event_likes' table here.

        // Now Delete the Event
        const deleteEventSql = 'DELETE FROM events WHERE id = ?';
        db.query(deleteEventSql, [event_id], (err, result) => {
            if (err) throw err;
            res.redirect('/');
        });
    });
});

// SHOW EDIT FORM (Protected: Admin Only)
app.get('/edit/:id', requireAdmin, (req, res) => {
    const eventId = req.params.id;
    const sql = 'SELECT * FROM events WHERE id = ?';

    db.query(sql, [eventId], (err, results) => {
        if (err) throw err;
        res.render('edit', { event: results[0] });
    });
});

// UPDATE EVENT (Save Changes)
app.post('/edit/:id', requireAdmin, upload.single('image'), (req, res) => {
    const eventId = req.params.id;
    const { name, date, venue, description, old_image } = req.body;
    const image = req.file ? req.file.filename : old_image;
    const sql = 'UPDATE events SET name = ?, date = ?, venue = ?, description = ?, image = ? WHERE id = ?';

    db.query(sql, [name, date, venue, description, image, eventId], (err, result) => {
        if (err) throw err;
        res.redirect('/');
    });
});

// 📊 NEW ROUTE: ADMIN VIEW REGISTERED USERS LIST
app.get('/admin/registrations/:id', requireAdmin, (req, res) => {
    const eventId = req.params.id;
    
    // 1. Get Event Details
    const eventQuery = 'SELECT id, name, date FROM events WHERE id = ?'; 
    
    // 2. Get Registered Users (Join registrations and users tables)
    const registrationsQuery = `
        SELECT u.id AS user_id, u.fullname, u.email, r.reg_date
        FROM registrations r
        JOIN users u ON r.user_id = u.id
        WHERE r.event_id = ?
        ORDER BY r.reg_date DESC
    `;

    db.query(eventQuery, [eventId], (err, eventResults) => {
        if (err) { console.error('Error fetching event details:', err); return res.status(500).send('Error fetching event details.'); }
        if (eventResults.length === 0) return res.status(404).send('Event not found.');

        const event = eventResults[0];

        db.query(registrationsQuery, [eventId], (err, registrations) => {
            if (err) { console.error('SQL Error fetching registrations list:', err); return res.status(500).send('Error fetching list.'); }
            
            // Convert date for EJS rendering
            event.event_date = new Date(event.date);

            res.render('registered_list', { // Renders the new EJS file
                event: event,
                registrations: registrations,
                title: 'Registered Users'
            });
        });
    });
});
// --- STUDENT FEATURES ---

// HANDLE "JOIN EVENT" CLICK
app.post('/join-event', requireLogin, (req, res) => {
    const { event_id } = req.body;
    const user_id = req.session.user.id;

    const checkSql = 'SELECT * FROM registrations WHERE user_id = ? AND event_id = ?';
    db.query(checkSql, [user_id, event_id], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            return res.render('message', {
                title: 'Already Registered!',
                icon: '🎉', 
                message: 'Good news! You are already on the guest list for this event.',
                linkText: 'Go to My Dashboard',
                linkUrl: '/dashboard'
            });
        } 
        
        const insertSql = 'INSERT INTO registrations (user_id, event_id) VALUES (?, ?)';
        db.query(insertSql, [user_id, event_id], (err, result) => {
            if (err) throw err;
            res.redirect('/dashboard');
        });
    });
});

// NEW ROUTE: HANDLE LIKE/UNLIKE ACTION (AJAX)
app.post('/event/toggle-like', requireLogin, (req, res) => {
    const { event_id } = req.body;
    const user_id = req.session.user.id;

    if (!event_id) {
        return res.status(400).json({ success: false, message: 'Event ID is required.' });
    }

    // 1. Check if the user already likes the event
    const checkSql = 'SELECT * FROM event_likes WHERE user_id = ? AND event_id = ?';

    db.query(checkSql, [user_id, event_id], (err, results) => {
        if (err) {
            console.error('SQL ERROR on /event/toggle-like (check):', err);
            return res.status(500).json({ success: false, message: 'Database error.' });
        }

        let actionSql;
        let isLiked = false; // The new state after the action

        if (results.length > 0) {
            // User already likes it -> UNLIKE (DELETE)
            actionSql = 'DELETE FROM event_likes WHERE user_id = ? AND event_id = ?';
            // isLiked remains false (unliked)
            
        } else {
            // User does not like it -> LIKE (INSERT)
            actionSql = 'INSERT INTO event_likes (user_id, event_id) VALUES (?, ?)';
            isLiked = true; // The new state is liked
        }

        // 2. Perform the action (INSERT or DELETE)
        db.query(actionSql, [user_id, event_id], (actionErr, actionResult) => {
            if (actionErr) {
                console.error('SQL ERROR on /event/toggle-like (action):', actionErr);
                return res.status(500).json({ success: false, message: 'Database error during action.' });
            }

            // 3. Get the new total like count
            const countSql = 'SELECT COUNT(id) AS new_like_count FROM event_likes WHERE event_id = ?';
            
            db.query(countSql, [event_id], (countErr, countResults) => {
                if (countErr) {
                    console.error('SQL ERROR on /event/toggle-like (count):', countErr);
                    return res.status(200).json({ 
                        success: true, 
                        message: isLiked ? 'Liked successfully.' : 'Unliked successfully.',
                        isLiked: isLiked, 
                        newCount: -1 // Indicate count fetch failed
                    });
                }

                // Success, return new count and action state
                res.status(200).json({
                    success: true,
                    message: isLiked ? 'Liked successfully.' : 'Unliked successfully.',
                    isLiked: isLiked, 
                    newCount: countResults[0].new_like_count
                });
            });
        });
    });
});


// HANDLE RATING SUBMISSION (AJAX VERSION)
app.post('/event/:event_id/rate', requireLogin, (req, res) => {
    const event_id = req.params.event_id;
    const user_id = req.session.user.id; 
    const { rating } = req.body; 

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Please provide a rating between 1 and 5.' });
    }

    const updateStudentRatingSql = `
        UPDATE registrations 
        SET rating = ? 
        WHERE user_id = ? AND event_id = ?
    `;

    db.query(updateStudentRatingSql, [rating, user_id, event_id], (err, results) => {
        if (err) {
            console.error("Error updating student rating:", err);
            return res.status(500).json({ message: 'Database error while updating registration.' });
        }
        
        const updateAvgSql = `
            UPDATE events 
            SET 
                avg_rating = (SELECT AVG(rating) FROM registrations WHERE event_id = ? AND rating IS NOT NULL),
                rating_count = (SELECT COUNT(rating) FROM registrations WHERE event_id = ? AND rating IS NOT NULL)
            WHERE id = ?
        `;

        db.query(updateAvgSql, [event_id, event_id, event_id], (avgErr) => {
            if (avgErr) console.error("Error updating average rating:", avgErr);
            
            res.status(200).json({ 
                message: 'Rating submitted successfully!', 
                rating: rating 
            });
        });
    });
});


// STUDENT DASHBOARD
app.get('/dashboard', requireLogin, (req, res) => {
    const sql = "SELECT e.id AS event_id, e.name, e.date, e.venue, e.description, r.rating, r.attended FROM registrations r JOIN events e ON r.event_id = e.id WHERE r.user_id = ?";

    db.query(sql, [req.session.user.id], (err, results) => {
        if (err) {
             console.error('SQL ERROR IN /dashboard ROUTE:', err);
             return res.status(500).send('Database Error loading dashboard.');
        }

        const eventsWithDateObjects = results.map(event => {
            event.event_date = new Date(event.date); 
            return event;
        });

        res.render('dashboard', { 
            user: req.session.user, 
            events: eventsWithDateObjects
        });
    });
});


// --- 5. START SERVER ---
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});