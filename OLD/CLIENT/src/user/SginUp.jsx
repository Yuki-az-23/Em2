import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { sginUp } from './UserApi';
const SginUp = () => {
    const [profile,setProfile] = useState({
        name: '',
        email:'',
        password:'',
        error:'',
        open:false
    })
    const handleChange = (event) => {
        const {value,name } = event.target;
        //debug thers is an bug wehn trying to clear the error the prevValue disapeer
        setProfile(prevValue =>{
            return {
                ...prevValue,
                [name]: value
            }
    })
}

const isValid = () => {
    const {name, email,password} = profile;
    //debug the length does not work
    if(name.length > 20){
        setProfile(prevValue=>{return{...prevValue ,error: 'Name is required to be under 20 characters'}})
        return false
    }if(name === undefined){
        setProfile(prevValue=>{return{...prevValue ,error: 'Name is required'}})
        return false
    }if(name.length === 0){
        setProfile(prevValue=>{return{...prevValue ,error: 'Name is required'}})
        return false
    }if(!/^\w+([\.-?\w+])*@\w+([\.-]?w+)*(\.\w{2,3})+$/.test(email)){
        setProfile(prevValue=>{return{...prevValue ,error: 'a valid email is required'}})
        return false
    }if(password === undefined){
        setProfile(prevValue=>{return{...prevValue ,error: 'must set a password'}})
        return false
    }if(password.length >= 1 && password.length <= 5){
        setProfile(prevValue=>{return{...prevValue ,error: 'password must be at least 6 characters and with letter and symbol'}})
        return false
    }
    return true
}
    const clickSubmit = (e) =>{
        e.preventDefault()
        const {name, email,password} = profile
        const user = {
            name,
            email,
            password,
        };
        if(isValid()){sginUp(user)
        .then(response => {
            return response.json()
        })
        .catch(err => console.log(err))
        .then((data) => {
            if (data.error){
                setProfile({ error: data.error})
            }else{
                setProfile({name:'',email:'',password:'',error:'',open:true})
            } 
            }
        )}
    }
    

    return (<div className="container">
        <h2 className="mt-5 mb-5">Hello {profile.name}</h2>
        <div className="alert alert-primary" style={{display: profile.error ? '' : 'none'}}>{profile.error}</div>
        <div className="alert alert-info" style={{display: profile.open ? '' : 'none'}}>New account successfully created. please <Link to='/signin'>Log In</Link></div>
        <form>
            <div className="from-group">
                <label className="text-muted">Name</label>
                <input name="name" value={profile.name} onChange={handleChange} type="text" className="form-control"/>
                <label  className="text-muted">Email</label>
                <input name="email"  value={profile.email} onChange={handleChange} type="email" className="form-control"/>
                <label className="text-muted">password</label>
                <input name="password"  value={profile.password} onChange={handleChange} type="password" className="form-control"/>
            </div>
            <div className="center mt-3">
            <button onClick={clickSubmit} type="submit" className="btn btn-raised btn-primary">Register</button>
            </div>
            
        </form>
    </div>)


}


export default SginUp;