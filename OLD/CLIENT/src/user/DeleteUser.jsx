import React , { useState,useEffect }from 'react';
import { Redirect } from 'react-router-dom';
import { isAuthenticated, signout } from '../auth/index'
import { remove } from './UserApi';

const DeleteUser = (props) => {

    const [redirect,setRedirect] = useState({
        redirect:false,
    })

    const deleteProfile =() => {
        const token = isAuthenticated().token;
        const userId = props.userId
        remove(userId,token)
        .then(data => {
            if(data.error){
                console.log(data.error);
            } else {
                signout(() => console.log('user is delated'))
                // signout user and redirect
                setRedirect({redirect:true})
            }
        })
        
    };

    const deleteConfirm = () =>{
        let answer = window.confirm('Are you sure you want to delete the profile?')
        if(answer){
            deleteProfile()
        }
    };
    if(redirect.redirect){
       return <Redirect to='/'/>
    }
    return (
        <button onClick={deleteConfirm} className='btn btn-raised btn-danger'>Delete Profile</button>
    )
}

export default DeleteUser;