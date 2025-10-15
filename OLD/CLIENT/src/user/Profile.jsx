import React , { useState,useEffect }from 'react';
import { Redirect ,Link } from 'react-router-dom';
import { isAuthenticated } from '../auth/index'
import DefaultProfile from '../images/avater.png';
import DeleteUser from './DeleteUser'
import { read } from './UserApi';
import {ListByUser ,remove} from '../post/ApiPost';
import profileCSS from './css/profile.css';
import FavoriteIcon from '@material-ui/icons/Favorite';
import FollowProfileBtn from './FollowProfileBtn';
import CommentIcon from '@material-ui/icons/Comment';
import Loading from '../core/Loading';

const Profile = (props) => {
    const userIdUrl = props.match.params.userId;
    

    const [user,setUser] = useState({
        name:'',
        email:'',
        emotion:'',
        color:'',
        id:'',
        followingStage:false,
        following:[],
        followers:[],
        error:'',
        
    })
    const [loading,setLoading] = useState(false);
    const [posts,setPosts] = useState({
        posts:[]
    })
    const {followingStage,followers,following} = user 
    const linkStyle = {
        textDecoration: 'none',
        color:'#212529'
    }
    const photoUrl = props.match.params.userId ? `${process.env.REACT_APP_API_URL}/user/photo/${props.match.params.userId}` : DefaultProfile
    const braces = [];
    posts.posts.map((post,i) => {
        
        return braces.push(post.brace.length)
    })
    
    
    const getSum = (total,num) => {
        return total + Math.round(num)
    }
    const brace = braces.reduce(getSum,0);
    
    
    const checkFollow = user => {
        const jwt = isAuthenticated()
        const match = user.followers.find(follower =>{
            // one id has many other ids (followers) and vice versa
            return follower._id === jwt.user._id
        })
        return match
    }

    const handleFollow = (callApi) => {
        const userIdAuth = isAuthenticated().user._id;
        const token = isAuthenticated().token;
        callApi(userIdAuth,token,user.id)
        .then(data => {
            if(data.error){
                setUser({...user,error:data.error})
            }else {
                ///need to handle the data correctly
                setUser({...user,following:data.following,followers:data.followers, followingStage:!followingStage})
            }
        })
    }

    useEffect(() => {
        const userId = props.match.params.userId;
        const token = isAuthenticated().token;
        let mounted = true
        setLoading(true)
        read(userId,token)
        .then(data =>{
            if(mounted) {
                if(!data.error){               
                    let following = checkFollow(data)
                    setUser(
                    {...user,name:data.name,
                         email:data.email,
                         emotion:data.emotion,
                         color:data.color,
                         id:data._id,
                         followingStage:following,
                         following:data.following,
                         followers:data.followers,
                        })
                        setLoading(false) 
                }if(data.error){
                    console.log(data.error);
                }
            }
            
        })
        return function cleanup(){
            mounted = false
        }
    }, [userIdUrl])
    

    const loadPosts = userIdRead =>{
        const token = isAuthenticated().token;
        ListByUser(userIdRead,token)
        .then(data =>{
            if(data.error){
                console.log(data.error);
            }else{
                setPosts({posts:data.posts})
                setLoading(false)
            }
        })
    }

    useEffect( () => {
        const userId = props.match.params.userId;
        let mounted = true
        if(mounted){
            loadPosts(userId)
        }
        return function cleanup(){
            mounted = false
        }
     },[posts])

    const deleteRepate = (repeatId) =>{
        const token = isAuthenticated().token;
        remove(repeatId,token).then(data =>{
            if(data.error){
                console.log(data.error);
            }else{
                loadPosts(userIdUrl)
                setLoading(true)
            }
        })
    }

    const deleteConfirm = (e) =>{
        let repeatId = e.target.value;
        let answer = window.confirm('Are you sure you want to delete the Repate?')
        if(answer){
            deleteRepate(repeatId)
        }
    };

    if(!isAuthenticated()) {
        return <Redirect to='/signin'/>
        }
     
       
    return (
        
        <div className='container'>
        {loading ? (<Loading/>) : (<div className=''>
                <div className='col-auto center '>
                    <img className="avter-img" src={photoUrl} alt={user.name}
                        onError={i => (i.target.src = `${DefaultProfile}`)}
                    />
                </div>

                <div className='col-auto'>
                    <div className='name-title center'>
                        {isAuthenticated().user && isAuthenticated().user._id === user.id ?
                        (<h2 className="mt-3 mb-3">Hello {user.name}</h2> )
                        :
                        (<h2 className="mt-3 mb-3">{user.name}</h2> ) }   
                    </div>
                    <div className='Icons center '>
                        <div className='Icon '><h2 className='M2'>{brace} <FavoriteIcon/></h2></div> 
                        <div className='Icon vl'><Link className='link3' to={`/following/${user.id}`}><h2 className='M2'>{following.length} Following</h2></Link></div>
                        <div className='Icon vl'><Link className='link3' to={`/followers/${user.id}`}><h2 className='M2'>{followers.length} Followers</h2></Link></div>   
                    </div>
                     
                     
                    {isAuthenticated().user && isAuthenticated().user._id === user.id ? (
                    <div className='d-inLine-block mt-3 center'>
                        <Link className = 'btn btn-raised btn-success Mr-4' to={`/user/edit/${user.id}`}>Edit Profile</Link>
                        <DeleteUser userId = {isAuthenticated().user._id}/>
                    </div>
                    ):(<FollowProfileBtn onClickedHandle={handleFollow} following={followingStage} />)}
                </div>
                <hr/>
                <div className=""> 
                    <div className="center col-auto">
                        <h2>Posts</h2>
                        
                        {posts.posts.map((post,i)=>(
                            <div className='card1 P1 center' id={post.color} key ={i}>
                                <h2 className ='card-header'>Emotion : {post.emotion}</h2>
                                <Link className='hover card-title' style={linkStyle} to={`/post/${post._id}`}><h2>{post.title}</h2></Link>
                                
                                <div className='fBR card-footer center'>
                                    <h3 style = {{margin:'0 3% 0 0'}}>{post.brace.length}<FavoriteIcon/></h3>
                                    <h3>{post.comments.length} <CommentIcon/></h3> 
                                </div>
                                {isAuthenticated().user && isAuthenticated().user._id === post.postedBy._id && (<button value={post._id} onClick={deleteConfirm} className="btn btn-danger btn-sm">Delete Repate</button>) }
                            </div>
                        ))}
                    </div>   
            </div>
        </div>)}
            
    </div>
    )
}

export default Profile;