const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const methodOverride = require('method-override');
const session = require('express-session');
const multer = require('multer');

const app = express();

mongoose.connect('mongodb://localhost:27017/blog', {
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
    createdAt: { type: Date, default: Date.now }
});

const Category = mongoose.model('Category', {
    name: String,
    slug: String,
    createdAt: { type: Date, default: Date.now }
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
    const posts = await Post.find().sort({ createdAt: -1 });
    const categories = await Category.find().sort({ name: 1 });
    res.render('index', { posts, categories });
});

app.get('/search', async (req, res) => {
    const searchQuery = req.query.q;
    const categories = await Category.find().sort({ name: 1 });
    
    if (!searchQuery) {
        const posts = await Post.find().sort({ createdAt: -1 });
        return res.render('index', { posts, categories, searchQuery: '' });
    }
    
    const posts = await Post.find({
        $or: [
            { title: { $regex: searchQuery, $options: 'i' } },
            { content: { $regex: searchQuery, $options: 'i' } }
        ]
    }).sort({ createdAt: -1 });
    
    res.render('search', { posts, categories, searchQuery });
});

app.get('/category/:slug', async (req, res) => {
    const posts = await Post.find({ category: req.params.slug }).sort({ createdAt: -1 });
    const categories = await Category.find().sort({ name: 1 });
    res.render('category', { posts, categories, currentCategory: req.params.slug });
});

app.get('/post/:id', async (req, res) => {
    const post = await Post.findById(req.params.id);
    const categories = await Category.find().sort({ name: 1 });
    res.render('post', { post, categories });
});

app.get('/admin', (req, res) => {
    if (!req.session.admin) {
        return res.redirect('/admin/login');
    }
    res.render('admin/dashboard');
});

app.get('/admin/login', (req, res) => {
    res.render('admin/login');
});

app.post('/admin/login', (req, res) => {
    if (req.body.password === 'admin123') {
        req.session.admin = true;
        res.redirect('/admin');
    } else {
        res.redirect('/admin/login');
    }
});

app.get('/admin/posts', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    const posts = await Post.find().sort({ createdAt: -1 });
    const categories = await Category.find().sort({ name: 1 });
    res.render('admin/posts', { posts, categories });
});

app.get('/admin/posts/new', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    const categories = await Category.find().sort({ name: 1 });
    res.render('admin/new-post', { categories });
});

app.post('/admin/posts', upload.single('image'), async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    
    const postData = {
        title: req.body.title,
        content: req.body.content,
        category: req.body.category
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
    res.render('admin/edit-post', { post, categories });
});

app.put('/admin/posts/:id', upload.single('image'), async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    
    const updateData = {
        title: req.body.title,
        content: req.body.content,
        category: req.body.category
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
    res.render('admin/categories', { categories });
});

app.get('/admin/categories/new', (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    res.render('admin/new-category');
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
    res.render('admin/edit-category', { category });
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

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Blog sitesi http://localhost:${PORT} adresinde çalışıyor`);
});