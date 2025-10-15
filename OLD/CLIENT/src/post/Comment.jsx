import React , { useState,useEffect} from 'react';
import { isAuthenticated } from '../auth/index';
import {addCommentOne ,unComment,update} from './ApiPost';
import { read } from '../user/UserApi';

const Comment = (props) => {
    const[comment,setComment] = useState({
        text : '',
        error:'',
        userEmotion:'',
        userColor:'',
    });
    const {text,error} = comment;

    const handleChange = (e) => {
        setComment({...comment,text : e.target.value,error:''})
    }
    const isValid = ()=> {
         if(!text.length > 0 || text.length >150){
             setComment({error:'comment should be less than 150 characters and not empty'});
             return false
         }
         return true;
    };


    useEffect(() => {
        const userId = isAuthenticated().user._id;
        const token = isAuthenticated().token;
        read(userId,token).then(data => {
            if(data.error){
                console.log(data.error);
            }else{
                setComment({
                    ...comment,
                    userColor:data.color,
                    userEmotion:data.emotion,
                })
            }
        })
    },[])

   
    const addComment = (e) =>{
        e.preventDefault()
        if(isValid()){
        const {userEmotion,userColor} = comment;
        const userId = isAuthenticated().user._id;
        const token = isAuthenticated().token;
        const postId = props.postId;
        const color = userColor;
        const emotion = userEmotion;
        const EcBridgeData = new FormData();
        EcBridgeData.append('color',`${color}`);
        EcBridgeData.append('emotion',`${emotion}`);
        update(postId,token,EcBridgeData)
        addCommentOne(userId,token,postId,{text : comment.text},color,emotion)
        .then(data => {
            if(data.error){
                console.log(data.error);
            }else{
                setComment({...comment,text :''})
                props.updateComments(data.comments)
            }
        })
        }
        
    }
    

    return(<div className="mt-3" >
        <form className='row g-3 center' onSubmit={addComment} >
            <div className="col-6 col-4 col-2">
            <input placeholder="Write your comment" type="text" onChange={handleChange} className="form-control"/>
            </div>
            <div className='col-auto'>
            <button className="btn btn-raised btn-light " type="submit" onClick={addComment}>Repate</button>
            </div>
        </form>
        <div className='alert alert-danger' style={{display:error ? '' : 'none'}}>
        {error}
        </div>
    </div>)
}

export default Comment;