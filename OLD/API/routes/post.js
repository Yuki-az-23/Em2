const {requireSignin} = require('../conttrollers/auth');
const express = require('express');
const {getPosts, createPost, postsByUser,postById,isPoster,deletePost,updatePost,photo,singlePost,brace,unBrace
,comment,unComment} = require('../conttrollers/post')
const {userById} = require('../conttrollers/user');
const {createPostValidator} = require('../validator/')

const router = express.Router()


//get post
router.get('/posts',getPosts);
router.get('/post/:postId',singlePost)
//brace a post
router.put('/post/brace',requireSignin,brace)
router.put('/post/unBrace',requireSignin,unBrace)
//comments
router.put('/post/comment',requireSignin,comment)
router.put('/post/unComment',requireSignin,unComment)
//post by userid
router.post('/post/new/:userId',requireSignin , createPost, createPostValidator );
router.get('/posts/by/:userId',requireSignin,postsByUser);
//post by postid
router.delete('/post/:postId',requireSignin,isPoster,deletePost);
//update the post EcBrige
router.put('/post/:postId',requireSignin,updatePost);

//photo
router.get('/post/photo/:postId',photo);

router.param('userId',userById);
//any route containinig :userId,our app will first excute postById

router.param('postId',postById);

module.exports = router;