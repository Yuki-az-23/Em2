import React , { useState , useEffect, useRef}from 'react'
import { isAuthenticated } from '../auth/index';
import { Redirect } from 'react-router-dom';
import { read } from '../user/UserApi';
import {update} from './UserApi';
import DefaultProfile from '../images/avater.png';
import Loading from '../core/Loading';

const EditProfile = (props) => {
    const [user,setuser] = useState({
        name: '',
        email: '',
        id:'',
        password: '',
        photo:'',
        error:'',
        redirectToProfile: false,
        loading:false,
        
    })
    const form = useRef(null)
    useEffect(() => {
        const userId = isAuthenticated().user._id;
        const token = isAuthenticated().token;
        read(userId,token).then(data => {
            if(data.error){
                console.log(data.error);
            }else{
                setuser({name:data.name,email:data.email,password:data.password})
            }
        })
    },[])
    const isValid = () => {
        const {name, email ,fileSize,password} = user;
        if(fileSize > 2097152){
            setuser(prevValue =>{return{
                ...prevValue,
                error:'File Size should be less the 2mb',
                loading: false
            }})
            return false;
        }
        if(fileSize === 0){
            setuser(prevValue =>{return{
                ...prevValue,
                error:'you need to set profile Picture',
                loading: false
            }})
            return false;
        }
        if(fileSize === undefined){
            setuser(prevValue =>{return{
                ...prevValue,
                error:'you need to set profile Picture',
                loading: false
            }})
            return false;
        }
        //debug the length does not work
        if(name.length > 20){
            setuser(prevValue=>{return{...prevValue ,photo:'',error: 'Name is required to be under 20 characters'}})
            return false
        }if(name === undefined){
            setuser(prevValue=>{return{...prevValue ,photo:'',error: 'Name is required'}})
            return false
        }if(name.length === 0){
            setuser(prevValue=>{return{...prevValue ,photo:'',error: 'Name is required'}})
            return false
        }if(!/^\w+([\.-?\w+])*@\w+([\.-]?w+)*(\.\w{2,3})+$/.test(email)){
            setuser(prevValue=>{return{...prevValue ,photo:'',error: 'a valid email is required'}})
            return false
        }if(password === undefined){
            setuser(prevValue=>{return{...prevValue ,photo:'',error: 'must set a new password'}})
            return false
        }if(password.length >= 1 && password.length <= 5){
            setuser(prevValue=>{return{...prevValue ,photo:'',error: 'password must be at least 6 characters'}})
            return false
        }
        return true
    }
    const handleChange = name => event => {
        const value = name === 'photo' ? event.target.files[0] : event.target.value;
        const fileSize = name === 'photo' ? event.target.files[0].size : 0;
        setuser({...user, [name]: value,fileSize,error: ''});
        }
   
    const clickSubmit = (e) =>{
        e.preventDefault()
        const userData = new FormData(form.current);
        const userId = props.match.params.userId;
        const token = isAuthenticated().token;
        if(isValid()){
            update(userId,token,userData).then((data) => {
                if (data.error){
                    setuser({ error: data.error})
                }else{
                    setuser({redirectToProfile:true,loading:true})
                    } 
                }
            )
        }
        }
    if(user.redirectToProfile){
       return <Redirect to={`/user/${props.match.params.userId}`}/>;
    }

    const photoUrl = props.match.params.userId ? `${process.env.REACT_APP_API_URL}/user/photo/${props.match.params.userId}` : DefaultProfile

    return (<div className="container">
    <h2 className="mt-5 mb-5">Edit Profile</h2>
    {user.Loading ? (<Loading/>) : (<><div className="alert alert-primary" style={{display: user.error ? '' : 'none'}}>{user.error}</div>
    <img style={{height:'200px', width:'auto'}} className='img-thumbnail' src={photoUrl} alt={user.name}/>
    <form ref={form}>
        <div className="from-group">
            <label className="text-muted">Profile Picture</label>
            <input name="photo" accept='.png, .jpg, .jpeg' onChange={handleChange('photo')} type="file" className="form-control"/>
            <label className="text-muted">Name</label>
            <input name="name" value={user.name} onChange={handleChange('name')} type="text" className="form-control"/>
            <label  className="text-muted">Email</label>
            <input name="email" value={user.email} onChange={handleChange('email')} type="text" className="form-control"/>
            <label className="text-muted">Password</label>
            <input name="password" value={user.password} onChange={handleChange('password')} type="password" className="form-control"/>
        </div>
        <div className="center mt-5">
        <button onClick={clickSubmit} type="submit" className="btn btn-raised btn-primary">UPDATE</button>
        </div>
        
    </form></>)}
</div>)
}

export default EditProfile;