import React , { useState , useEffect, useRef}from 'react';
import { isAuthenticated } from '../auth/index';
import { Redirect } from 'react-router-dom';
import {create} from './ApiPost';
import EditorJS from '@editorjs/editorjs';
import Embed from '@editorjs/embed'; 
import newPost from './css/newPost.css';
import Loading from '../core/Loading';

const NewPost = (props) => {
    const [post,setpost] = useState({
        title: '',
        body: '',
        photo:'',
        error:'',
        redirectToHome: false,
        fileSize: 0,
        emotion:'',
        color:'',
        initialEmotion:'',
        initialColor:'',
        user:{},
        loading: false,
    })
    const form = useRef(null)
    

    useEffect(() => {
        setpost({user:isAuthenticated().user})
      }, []);
    //  need a debug does not work 
    const isValid = () => {
        const {title ,fileSize} = post;
        if(fileSize > 2097152){
            setpost(prevValue =>{ return{
              ...prevValue,
                photo:'',
                initialPhoto:'',
                fileSize: 0,
                error:'File Size should be less the 2mb',
                loading: false
            }})
            return false;
        }
        //debug the length does not work
        if(title === undefined){
          setpost(prevValue =>{return{...prevValue ,error: 'Title is required',loading: false}})
          return false;
        }
        if(title.length === 0){
          setpost(prevValue =>{return{...prevValue ,error: 'Title is required',loading: false}})
          return false;
        }

        if(title.length > 50){
            setpost(prevValue =>{return{...prevValue ,error: 'Title is to be under 50 characters',loading: false}})
            return false;
        }
        return true
    }


    const EDITTOR_HOLDER_ID = 'editorjs';
 
      const ejInstance = useRef();
      const [editorData, setEditorData] = useState({
          time:'',
          blocks:[],
          version:'',
      });
     
      // This will run only once
      useEffect(() => {
        const initEditor = () => {
          const editor = new EditorJS({
            holder: EDITTOR_HOLDER_ID,
            logLevel: "ERROR",
            data: editorData,
            onReady: () => {
              ejInstance.current = editor;
            },
            onChange:() => {
              editor.save().then((data) => {
                  setEditorData(data)
              });
              // Put your logic here to save this data to your DB
            },
            autofocus: true,
            tools: { 
              embed: Embed,
            }, 
          });
        };

        if (!ejInstance.current) {
          initEditor();
        }
        return () => {
          ejInstance.current.destroy();
          ejInstance.current = null;
        }
      }, []);
     
      
    

    //debug does not pass the data to formdata 
    const handleChange = name => event => {
        setpost({error:''});
        const value = name === 'photo' ? event.target.files[0] : event.target.value; 
        const fileSize = name === 'photo' ? event.target.files[0].size : 0;
        setpost({...post,error:'', [name]: value, [`initial${name[0].toUpperCase()}${name.slice(1)}`]: value ,fileSize});
        };
    
    
    const clickSubmit = (e) =>{
        setpost(prevValue =>{return{...prevValue,loading: true}})
        e.preventDefault()
        const userId = isAuthenticated().user._id;
        const token = isAuthenticated().token;
        const userData = new FormData(form.current);
        userData.append('initialEmotion',`${post.initialEmotion}`);
        userData.append('initialColor',`${post.initialColor}`);
        userData.append('blooks',`${JSON.stringify(editorData.blocks)}`);
        userData.append('time',`${editorData.time}`);
        userData.append('version',`${editorData.version}`);
        if(isValid()){create(userId,token,userData).then((data) => {
            if (data.error){
                setpost({ error: data.error})
                
            }else{
              
                setpost({redirectToHome:true,loading: true})
                } 
            }
        )}
        
    }
    
    if(post.redirectToHome){
       return <Redirect to={'/'}/>;
    }
    
    return (<div className="container center">
    {post.loading ? (<h2 className="mt-5 mb-5">Creating Your Repeat</h2>) : (<h2 className="mt-5 mb-5">Create Your Repeat</h2>)}
    <div className="alert alert-primary" style={{display: post.error ? '' : 'none'}}>{post.error}</div>
    {post.loading ? (<Loading/>) : (<form ref={form}  >
        <div className="from-group">
                <label className="text-muted">Title</label>
                <input name="title" value={post.title} onChange={handleChange('title')} type="text" className="form-control" min="1" max="10"/>
                <label  className="text-muted">Contant</label>
                {/* <input name="body" value={post.body} onChange={handleChange('body')} type="text" className="form-control"/> */}
                <React.Fragment>
                <div id={EDITTOR_HOLDER_ID}> </div>
                </React.Fragment>
            <div className="container" style={{justifyContent: 'center' , display:'flex'}}>
                <div className="col-md"><label className="text-muted">current emotion</label>
                <select className='form-select' name="emotion" onChange={handleChange('emotion')} value={post.emotion} >
                    <option value="Joy">Joy</option>
                    <option value="Trust">Trust</option>
                    <option value="Feared">Feared</option>
                    <option value="Surprised">Surprised</option>
                    <option value="Sad">Sad</option>
                    <option value="Disgust">Disgust</option>
                    <option value="Angry">Angry</option>
                    <option value="Anticipated">Anticipated</option>
                    </select>
                </div>
                 <div className="col-md">
                    <label className="text-muted">what color feels like</label>
                    <select className='form-select' name='color' onChange={handleChange('color')} value={post.color}>
                    <option value="yellow">yellow</option>
                    <option value="lime">lime</option>
                    <option value="green">green</option>
                    <option value="aqua">aqua</option>
                    <option value="blue">blue</option>
                    <option value="pink">pink</option>
                    <option value="red">red</option>
                    <option value="orange">orange</option>
                    </select>
                  </div>
                
            </div>
        </div>
        <div className="btn-box">
        <button onClick={clickSubmit} type="submit" className="btn btn-raised btn-primary mt-5">Repeat</button>
        </div>
    </form>)}
    
    
</div>)
}

export default NewPost;
