import React , { useState,useEffect} from 'react';
import {isAuthenticated} from '../auth/index';
import {update,singlePost} from './ApiPost'
import {read} from '../user/UserApi'

const EditPost = (props)=> {
    const [editPost,setEditPost] = useState({
        title:'',
        body:'',
        emotion:'',
        color:'',
        postId:'',
        error:'',


    })

    useEffect(() => {
        const postId = props.match.params.postId;
        singlePost(postId).then((data) =>{
            if(data.error){
                console.log(data.error)
            }else{
                console.log(data);
                setEditPost({
                    title:data.title,
                    body:data.body,
                    emotion:data.emotion,
                    color:data.color,
                    postId:data._id,
                    error:'',
                })
            }
        })
    },[])
    return (<div>
        <h2>Edit Post</h2>
        {props.match.params.postId}
    </div>)
}



export default EditPost;