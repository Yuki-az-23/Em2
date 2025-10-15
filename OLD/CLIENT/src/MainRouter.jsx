import React ,{ Suspense, lazy }from 'react';
import {Route,Switch} from 'react-router-dom';
import Loading from '../src/core/Loading';
import SginUp from './user/SginUp';
import SginIn from './user/SginIn';
import Menu from './core/Menu';
import Profile from './user/Profile';
import Users from './user/Users';
import PrivateRoute from './auth/PriveteRoute';
import NewPost from './post/NewPost';
import EditPost from './post/EditPost';
const EditProfile = lazy(() =>import('./user/EditProfile'))
const SinglePost = lazy(() =>import('./post/SinglePost'))
const Following = lazy(() =>import('./user/Following'))
const Followers = lazy(() =>import('./user/Followers'))
const Home = lazy(() =>import('./core/Home'))
const Feed = lazy(() =>import('./post/Feed'))
const MainRouter = () => {
    
    return(
        <div>
        <Menu/>
        <Suspense fallback={<Loading/>}>
        <Switch>
        {/* <Route exact path='/' component={Home}  ></Route> */}
        <PrivateRoute exact path='/users' comp={Users} />
        <PrivateRoute exact path='/following/:userId' comp={Following} />
        <PrivateRoute exact path='/followers/:userId' comp={Followers} />
        <Route exact path='/signin' component={SginIn}  ></Route>
        <Route exact path='/signup' component={SginUp}  ></Route>
        <PrivateRoute exact path='/user/edit/:userId' comp={EditProfile}  />
        <PrivateRoute exact path='/user/edit/:userId' comp={EditProfile}/>
        <PrivateRoute exact path='/user/:userId' comp={Profile}  />
        <PrivateRoute exact path='/' comp={Feed}  />
        <PrivateRoute exact path='/post/new/:userId' comp={NewPost}  />
        <PrivateRoute exact path='/post/:postId' comp={SinglePost}  />
        <PrivateRoute exact path='/post/edit/:postId' comp={EditPost}  />
        </Switch>
        </Suspense>
        </div>
    )

    
}

export default MainRouter;