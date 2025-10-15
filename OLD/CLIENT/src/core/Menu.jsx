import React from 'react';
import { Link , withRouter} from 'react-router-dom';
import { isAuthenticated } from '../auth/index';
import Hover from '../core/OnHover';
import HomeIcon from '@material-ui/icons/Home';
import PeopleIcon from '@material-ui/icons/People';
import RepeatIcon from '@material-ui/icons/Repeat';
import AccountCircleIcon from '@material-ui/icons/AccountCircle';
import DynamicFeedIcon from '@material-ui/icons/DynamicFeed';
import {signout} from '../auth';

const isActive =(history,path) =>{
    if(history.location.pathname === path) return {color:'#40B6F2'}
    else return {color:'#1B1818'}
};


const Menu = ({history})=>{

    return(
    <div style = {{display: 'flex',justifyContent: 'center'}}>
    <ul className="nav nav-tabs">
    {/* <li className="nav-item">
        <Link style={isActive(history,'/')} className="nav-link" to='/'><HomeIcon/></Link>
    </li> */}
    {!isAuthenticated() && (<div className="nav nav-tabs">
        <li className="nav-item">
        <Link style={isActive(history,'/signin')} className="nav-link" to='/signin'>Log in</Link>
    </li>
    <li className="nav-item">
        <Link style={isActive(history,'/signup')} className="nav-link" to='/signup'>Register</Link>
    </li>
    </div>
        )}
    {isAuthenticated() && (<div className='nav nav-tabs'>
    <li className="nav-item">
        <Link style={isActive(history,'/')} className="nav-link" to='/'><DynamicFeedIcon/></Link>
    </li>
    <li className="nav-item">
    <Link style = {isActive(history,`/post/new/${isAuthenticated().user._id}`)}className="nav-link" to={`/post/new/${isAuthenticated().user._id}`}><RepeatIcon/></Link>
    </li>
    {/* <li className="nav-item">
        <Link style={isActive(history,'/users')} className="nav-link" to='/users'><PeopleIcon/></Link>
    </li> */}
    {/* <li className="nav-item">
    <Link style = {isActive(history,`/user/${isAuthenticated().user._id}`)}className="nav-link" to={`/user/${isAuthenticated().user._id}`}><AccountCircleIcon/></Link>
    </li> */}
        <li className="nav-item">
        <Link to='/' onClick={() =>signout(()=> history.push('/'))} style={isActive(history,'/signup'),{cursor:'pointer'},{backgroundColor:'#7debfa'}} className="nav-link" ><Hover/></Link>
    </li>
    
    
    
    
    </div>
    )}    
    
    </ul>   
    </div>
    )
}


export default withRouter(Menu);

