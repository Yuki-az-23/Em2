import React , { useState,useEffect } from 'react';
import { Link } from 'react-router-dom';
import { List } from './ApiPost';
import DefaultPostImg from '../images/Repate.png';
import FavoriteIcon from '@material-ui/icons/Favorite';
import CommentIcon from '@material-ui/icons/Comment';
import postsCss from './css/posts.css';
import Output from 'editorjs-react-renderer';
import Masonry, {ResponsiveMasonry} from "react-responsive-masonry";
import {config} from './EditorConfig.js';
import DefaultProfile from '../images/avater.png';
import {isAuthenticated} from '../auth/index';
import { read } from '../user/UserApi';
import Loading from '../core/Loading';

const Feed = () => {
    const [posts,setPosts] = useState({
        posts:[],
        loading: true,
    })
    const [color,SetColor] = useState('');
    const [emotion,SetEmotion] = useState('');
    useEffect(() => {
        setPosts({...posts,loading: false})
        List().then(data =>{
            if(data.error){
                console.log(data.error);
            }else{
                setPosts({posts: data,loading:true})
            }
        })
    },[])
    useEffect(() => {
        const userId = isAuthenticated().user._id;
        const token = isAuthenticated().token;
        read(userId,token).then(data => {
            if(data.error){
                console.log(data.error);
            }else{
                SetColor(data.color)
                SetEmotion(data.emotion)
            }
        })
    },[])
    const style = {
        paragraph: {
          textAlign: 'center',
          cursor: 'default',
        }   
      };
    
 
    return(
    <ResponsiveMasonry
    columnsCountBreakPoints={{500: 1, 700: 2, 1400: 3,2100:4,2400:5,3200:6,3800:7}}>
        <Masonry >
        {posts.loading ? (posts.posts.filter(post => post.color === color || post.emotion === emotion ).map((post,i,a) =>{
            const posterId = post.postedBy ? `user/${post.postedBy._id}` : ''
            const posterName = post.postedBy ? post.postedBy.name : 'unknown'
            const postColor = post.color
            const Contant = {
                time:post.time,
                version:post.version,
                blocks:JSON.parse(post.blooks),
            }
            
            return <div key={post._id} className='card' id={postColor} style={{margin: '1%',justifyContent: 'center'}}>
                        <>
                        <div className='hader'>
                            <div className="grid-container-hader">
                                <div className="Aevter">
                                <Link className='link' to={`/user/${post.postedBy._id}`}>
                                <img className='float-left imgStyle'
                                    onError={i => (i.target.src = `${DefaultProfile}`)} 
                                    src={`${process.env.REACT_APP_API_URL}/user/photo/${post.postedBy._id}`} 
                                    alt={post.postedBy.name}/>
                                </Link>
                                </div>
                                <div className='side'>
                                    <h2 className='nameTitle title'><Link className='title' to={`${posterId}`}>{posterName}</Link></h2>
                                    <h2 className="emotionTitle title">currently feel {post.emotion}</h2>  
                                    <h2 className='dateTitle title'>on {new Date(post.created).toDateString()}</h2>
                                </div>
                            </div>    
                        </div>

                        <div className='body PC-5 center'>
                             <h2 className="title RepateTitle">{post.title}</h2>
                            <Output data={ Contant } style={style} config={ config } />
                        </div>
                        <div className='card-footer' style={{display:'flex' ,justifyContent: 'center'}}>
                                 <h3 style = {{margin:'0 3% 0 0'}}>{post.brace.length}<FavoriteIcon/></h3>
                                 <h3>{post.comments.length} <CommentIcon/></h3>
                            </div>
                        
                    <div className="card-body" style={{display:'flex',justifyContent: 'center'}}>
                        <Link className="btn btn-dark btn-sm btn-raised" to={`/post/${post._id}`}>Open Repeat</Link>
                    </div>
                    </>
                    </div>
    })) : (<Loading/>)}</Masonry>
    </ResponsiveMasonry>)

}






export default Feed;
