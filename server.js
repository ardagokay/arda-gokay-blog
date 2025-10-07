const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const methodOverride = require('method-override');
const session = require('express-session');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/blog';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});

const upload = multer({ storage: storage });

const Post = mongoose.model('Post', {
    title: String,
    content: String,
    category: String,
    image: String,
    tags: [String],
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const Category = mongoose.model('Category', {
    name: String,
    slug: String,
    createdAt: { type: Date, default: Date.now }
});

const Comment = mongoose.model('Comment', {
    postId: String,
    name: String,
    email: String,
    comment: String,
    createdAt: { type: Date, default: Date.now }
});

const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'arda07gokay@gmail.com',
        pass: process.env.EMAIL_PASS
    }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static('public'));
app.use(session({
    secret: 'blogsecret',
    resave: false,
    saveUninitialized: false
}));

app.get('/', async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 }).limit(6);
        const categories = await Category.find().sort({ name: 1 });
        const popularPosts = await Post.find().sort({ views: -1 }).limit(3);
        res.render('index', { 
            posts, 
            categories, 
            popularPosts,
            theme: req.query.theme || 'dark'
        });
    } catch (error) {
        res.render('index', { 
            posts: [], 
            categories: [], 
            popularPosts: [],
            theme: req.query.theme || 'dark'
        });
    }
});

app.get('/search', async (req, res) => {
    const searchQuery = req.query.q;
    const categories = await Category.find().sort({ name: 1 });
    const popularPosts = await Post.find().sort({ views: -1 }).limit(3);
    
    if (!searchQuery) {
        const posts = await Post.find().sort({ createdAt: -1 });
        return res.render('index', { 
            posts, 
            categories, 
            popularPosts,
            searchQuery: '',
            theme: req.query.theme || 'dark'
        });
    }
    
    const posts = await Post.find({
        $or: [
            { title: { $regex: searchQuery, $options: 'i' } },
            { content: { $regex: searchQuery, $options: 'i' } },
            { tags: { $regex: searchQuery, $options: 'i' } }
        ]
    }).sort({ createdAt: -1 });
    
    res.render('search', { 
        posts, 
        categories, 
        popularPosts,
        searchQuery,
        theme: req.query.theme || 'dark'
    });
});

app.get('/category/:slug', async (req, res) => {
    const posts = await Post.find({ category: req.params.slug }).sort({ createdAt: -1 });
    const categories = await Category.find().sort({ name: 1 });
    const popularPosts = await Post.find().sort({ views: -1 }).limit(3);
    res.render('category', { 
        posts, 
        categories, 
        popularPosts,
        currentCategory: req.params.slug,
        theme: req.query.theme || 'dark'
    });
});

app.get('/post/:id', async (req, res) => {
    try {
        await Post.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
        const post = await Post.findById(req.params.id);
        const categories = await Category.find().sort({ name: 1 });
        const popularPosts = await Post.find().sort({ views: -1 }).limit(3);
        const recentPosts = await Post.find().sort({ createdAt: -1 }).limit(3);
        const comments = await Comment.find({ postId: req.params.id }).sort({ createdAt: -1 });
        
        res.render('post', { 
            post, 
            categories, 
            popularPosts,
            recentPosts,
            comments,
            theme: req.query.theme || 'dark'
        });
    } catch (error) {
        res.redirect('/');
    }
});

app.post('/post/:id/like', async (req, res) => {
    try {
        await Post.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } });
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

app.post('/post/:id/comment', async (req, res) => {
    try {
        const comment = new Comment({
            postId: req.params.id,
            name: req.body.name,
            email: req.body.email,
            comment: req.body.comment
        });
        
        await comment.save();
        
        const mailOptions = {
            from: req.body.email,
            to: 'arda07gokay@gmail.com',
            subject: `Yeni Yorum: ${req.body.name}`,
            html: `
                <h2>Yeni Yorum Geldi!</h2>
                <p><strong>İsim:</strong> ${req.body.name}</p>
                <p><strong>Email:</strong> ${req.body.email}</p>
                <p><strong>Yorum:</strong> ${req.body.comment}</p>
                <p><strong>Yazı ID:</strong> ${req.params.id}</p>
            `
        };
        
        await transporter.sendMail(mailOptions);
        
        res.redirect(`/post/${req.params.id}?comment=success`);
    } catch (error) {
        res.redirect(`/post/${req.params.id}?comment=error`);
    }
});

app.get('/admin', (req, res) => {
    if (!req.session.admin) {
        return res.redirect('/admin/login');
    }
    res.render('admin/dashboard', { theme: 'dark' });
});

app.get('/admin/login', (req, res) => {
    res.render('admin/login', { theme: 'dark' });
});

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'admin' && password === 'Arda123.') {
        req.session.admin = true;
        res.redirect('/admin');
    } else {
        res.redirect('/admin/login?error=1');
    }
});

app.get('/admin/posts', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    const posts = await Post.find().sort({ createdAt: -1 });
    const categories = await Category.find().sort({ name: 1 });
    res.render('admin/posts', { posts, categories, theme: 'dark' });
});

app.get('/admin/posts/new', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    const categories = await Category.find().sort({ name: 1 });
    res.render('admin/new-post', { categories, theme: 'dark' });
});

app.post('/admin/posts', upload.single('image'), async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    
    const tags = req.body.tags ? req.body.tags.split(',').map(tag => tag.trim()) : [];
    
    const postData = {
        title: req.body.title,
        content: req.body.content,
        category: req.body.category,
        tags: tags
    };
    
    if (req.file) {
        postData.image = '/uploads/' + req.file.filename;
    } else if (req.body.image_url) {
        postData.image = req.body.image_url;
    }
    
    await Post.create(postData);
    res.redirect('/admin/posts');
});

app.get('/admin/posts/:id/edit', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    const post = await Post.findById(req.params.id);
    const categories = await Category.find().sort({ name: 1 });
    res.render('admin/edit-post', { post, categories, theme: 'dark' });
});

app.put('/admin/posts/:id', upload.single('image'), async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    
    const tags = req.body.tags ? req.body.tags.split(',').map(tag => tag.trim()) : [];
    
    const updateData = {
        title: req.body.title,
        content: req.body.content,
        category: req.body.category,
        tags: tags
    };
    
    if (req.file) {
        updateData.image = '/uploads/' + req.file.filename;
    } else if (req.body.image_url) {
        updateData.image = req.body.image_url;
    }
    
    await Post.findByIdAndUpdate(req.params.id, updateData);
    res.redirect('/admin/posts');
});

app.delete('/admin/posts/:id', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    await Post.findByIdAndDelete(req.params.id);
    res.redirect('/admin/posts');
});

app.get('/admin/categories', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    const categories = await Category.find().sort({ name: 1 });
    res.render('admin/categories', { categories, theme: 'dark' });
});

app.get('/admin/categories/new', (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    res.render('admin/new-category', { theme: 'dark' });
});

app.post('/admin/categories', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    
    const categoryData = {
        name: req.body.name,
        slug: req.body.name.toLowerCase().replace(/ /g, '-')
    };
    
    await Category.create(categoryData);
    res.redirect('/admin/categories');
});

app.get('/admin/categories/:id/edit', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    const category = await Category.findById(req.params.id);
    res.render('admin/edit-category', { category, theme: 'dark' });
});

app.put('/admin/categories/:id', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    
    const updateData = {
        name: req.body.name,
        slug: req.body.name.toLowerCase().replace(/ /g, '-')
    };
    
    await Category.findByIdAndUpdate(req.params.id, updateData);
    res.redirect('/admin/categories');
});

app.delete('/admin/categories/:id', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    await Category.findByIdAndDelete(req.params.id);
    res.redirect('/admin/categories');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Blog sitesi http://localhost:${PORT} adresinde çalışıyor`);
});