import React,{useState,useEffect} from 'react';
import {singlePost , brace ,unBrace, update,remove, unComment} from './ApiPost';
import DefaultPostImg from '../images/Repate.png';
import { Link ,Redirect } from 'react-router-dom';
import Loading from '../core/Loading';
import FavoriteIcon from '@material-ui/icons/Favorite';
import CommentIcon from '@material-ui/icons/Comment';
import FavoriteBorderIcon from '@material-ui/icons/FavoriteBorder';
import { isAuthenticated } from '../auth/index';
import Comment from './Comment';
import DefaultProfile from '../images/avater.png';
import Output from 'editorjs-react-renderer';
import {config} from './EditorConfig.js';
import singlePostCss from './css/singelPost.css';
import Skeleton from '@material-ui/lab/Skeleton';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
const SinglePost = (props) => {


    const [post,setPost] = useState({
        brace: false,
        braces: 0 ,
        redirectToSginin: false,
        comments:[],
        PostInitialColor:'',
        PostInitialEmotion:'',
        title:'',
        body:'',
        color:'',
        emotion:'',
        postId:'',
        postedBy:'',
        postPhoto:{data:{data:''}},
        created:'',
        bodyLoad:false,
        deleted:false,
    });
    
    const [body,setBody] = useState({
        blooks:'',
        version:'',
        time:'',
    });
    const stylebody = {
        paragraph: {
          cursor: 'default',
          textAlign: 'left',
          
        }, 
         embed: {
            video: {
              maxHeight: '100%',
              justifyContent: 'left',
            },
            figure: {
              justifyContent: 'left',
              alignItems:'left',
              maxHeight: '100%',
              height:'50%',
            },
            figcaption: {
              borderRadius: '5px',
              alignItems:'left',
              justifyContent: 'left',
              textAlign: 'left',
            }
        }
      };
    
    const posterName = post.postedBy ? post.postedBy.name : 'unknown';
    const posterId = post.postedBy ? `/user/${post.postedBy._id}` : '';  
    const {redirectToSginin,barces,comments,deleted} = post;

    const checkBrace = (barces) => {
        const userId = isAuthenticated() && isAuthenticated().user._id;
        let match = barces.indexOf(userId) !== -1
        return match;
    };


    useEffect(() => {
        
        const postIdRead = props.match.params.postId;
        singlePost(postIdRead).then(data => {
            if(data.error){
                console.log(data.error);
            }else{
                setBody({
                    blocks:JSON.parse(data.blooks),
                    version:data.version,
                    time:data.time,
                })
                setPost({
                    barces:data.brace.length,
                    brace:checkBrace(data.brace),
                    comments:data.comments,
                    PostInitialColor:data.initialColor,
                    PostInitialEmotion:data.initialEmotion,
                    title:data.title,
                    body:data.body,
                    emotion:data.emotion,
                    color:data.color,
                    postId:data._id,
                    postedBy:data.postedBy,
                    postPhoto:data.photo,
                    created:data.created,
                    postId:data._id,
                    bodyLoad:true,
                    
                })
                
            }
            
        })
        
    },[]);

    

    const updateComments = comments => {
        setPost({...post, comments, });
    }
    
    

    const barceToggle = () => {
        let {PostInitialEmotion,PostInitialColor} = post;
        let callApi = post.brace ? unBrace : brace
        const userId = isAuthenticated().user._id;
        const postIdToggle = post.postId;
        const token = isAuthenticated().token;
        const color = PostInitialColor;
        const emotion = PostInitialEmotion;
        const EcBridgeData = new FormData();
        EcBridgeData.append('color',`${color}`);
        EcBridgeData.append('emotion',`${emotion}`);
        callApi(userId, token, postIdToggle).then(data =>{
            if(data.error){
                console.log(data.error);
            }else{
                setPost({
                    ...post,
                    brace :!post.brace,
                    barces :data.brace.length,
                    post: data,
                    comments:data.comments,
                    emotion:data.emotion,
                    color:data.color,
                });
            }
        })
        if(!post.brace){
            update(postIdToggle,token,EcBridgeData).then(data =>{
                if(data.error){
                    console.log(data.error);
                }else{
                    console.log(data);
                }
            })
        }
    }
    const deleteRepate = () =>{
        const postIdRepate = props.match.params.postId;
        const token = isAuthenticated().token;
        remove(postIdRepate,token).then(data =>{
            if(data.error){
                console.log(data.error);
            }else{
                setPost({deleted:true})
            }
        })
    }

    const deleteConfirm = () =>{
        let answer = window.confirm('Are you sure you want to delete the Repate?')
        if(answer){
            deleteRepate()
        }
    };

    const deleteComment = (comment) =>{
        const userId = isAuthenticated().user._id;
        const token = isAuthenticated().token;
        const postId = post.postId;
        unComment(userId ,token,postId,comment).then(data =>{
            if(data.error){
                console.log(data.error);
            }else{
                updateComments(data.comments)
            }
        })
    } 

    const deleteConfirmComment = (comment) =>{
        let answer = window.confirm('Are you sure you want to delete the comment?')
        if(answer){
            deleteComment(comment)
            
        }
    }
  
    if(deleted){
        return <Redirect to={`/`}/>;
    }
    
    
    if(!isAuthenticated()){
        return <Redirect to={`/signin`}/>;
    }
    console.log(post);
    return (
        <div className='container float-left' id={post.color}>
        {post.bodyLoad ? (<>
           <div className='back'>
           <Link className="btn btn-dark btn-sm btn-raised icon" to={`/`}><ArrowBackIcon/></Link>
           </div>
            <div className='haeder-post'>
                <div className='top'>
                <div className="col-auto ">
                    <Link className='link2' to={`/user/${post.postedBy._id}`}>
                        <img className='float-left imgStyle2'
                        onError={i => (i.target.src = `${DefaultProfile}`)} 
                        src={`${process.env.REACT_APP_API_URL}/user/photo/${post.postedBy._id}`} 
                        alt={post.postedBy.name}/>
                    </Link>
                </div>
                    <div className='col-auto ML-4'>
                        <h2 className='nameTitle title2'><Link className='title' to={`${posterId}`}>{posterName}</Link></h2>
                        <h2 className='feelTitle title2'>currently feel {post.emotion}</h2> 
                        <h2 className='dateTitle title2'>on {new Date(post.created).toDateString()}</h2>
                    </div>
                    <div className='col-auto B4'>
                    {post.brace ? (<button className='brace'  onClick={barceToggle}><FavoriteIcon style={{color:post.color}}/></button>) 
            : (<button className='brace'  onClick={barceToggle}><FavoriteIcon style={{color:'grey'}}/></button>)}
                    </div>
                </div>
                
            </div>
        
        <div className='body-post '>
            <h2 className='main-title'>{post.title}</h2>
            {post.bodyLoad ? (<Output data={ body } style={stylebody} config={ config } />) : (<div></div>)}
        </div>
        <div className='center mt-5'>
            {/* {isAuthenticated().user && isAuthenticated().user._id === post.postedBy._id && (<Link style={{borderRadius:'45%',backgroundColor:'red'}} className="btn btn-sm btn-raised" to={`/post/edit/${post.postId}`}>edit post</Link>) } */}
            {isAuthenticated().user && isAuthenticated().user._id === post.postedBy._id && (<button onClick={deleteConfirm} className="btn btn-danger btn-sm">Delete Repate</button>) }
        </div>
            <div>
               <Comment postId={post.postId} comments={comments} updateComments={updateComments} /> 
               <hr/>
               <div className="col-4 col-6 col-12">
                    <div className="icons">
                        <h2 className="icon">{comments.length} <CommentIcon/></h2>
                        <h2 className='icon'>{barces} <FavoriteIcon/></h2>
                    </div>
                    <hr/>
                    {comments.map((comment,i)=>(
                        <>
                            <div className= 'commnet-box'>
                            <div className='col-4 col-6 col-12 ' key={i}>
                                    <div className='top-comment center'>
                                       <div><Link to={`/user/${comment.postedBy._id}`}>
                                        <img style={{borderRadius:'50%',border: '1px solid black'}}
                                        className='float-left mr-2 comment-avater'
                                        onError={i => (i.target.src = `${DefaultProfile}`)}
                                        src={`${process.env.REACT_APP_API_URL}/user/photo/${comment.postedBy._id}`}
                                        alt={comment.postedBy._id}/>
                                         </Link>
                                    </div> 
                                    <div className='postedBy' >
                                        <h4 className='name'>{comment.postedBy.name} on {new Date(comment.created).toDateString()}</h4>
                                        <div className='comment-body'>
                                        <h4>{comment.text}</h4>   
                                        </div>
                                    </div>

                                    <div>
                                    
                                    {isAuthenticated().user && isAuthenticated().user._id === comment.postedBy._id &&
                                     (<button onClick={() => deleteConfirmComment(comment)} className='btn btn-raised btnDelete'>remove</button>)}
                                    
                                </div>
                                    </div>
                                   
                                </div>
                                
                                <hr/> 
                            </div>
                        </>
                    ))}
               </div>
            </div>
            </>
            ) : (<><Skeleton variant="text" />
                        <Skeleton variant="circle" width={40} height={40} />
                        <Skeleton variant="rect" width={210} height={118} /></>)}
        </div>
    )

}

export default SinglePost; 
