import { useEffect, useState } from 'react';
import { ActionIcon, Container, Menu, Space } from '@mantine/core';
import { AppShell } from '@mantine/core';
import NavBar from './NavBar';
import FooterPage from './Footer';
import HeaderPage from './Header';
import { getmainpath } from '../js/utils';
import { useLocation } from 'react-router-dom';
import { RiMenu5Fill } from 'react-icons/ri';




function MainLayout({ children }:{ children:any }) {
  const [opened, setOpened] = useState(false);
  const location = useLocation()
  useEffect(()=>{
    if (location.pathname !== "/"){
      sessionStorage.setItem('home_section', getmainpath())
    }
  },[location.pathname])


  return <>  
    <AppShell padding="md">
    <AppShell.Navbar><NavBar closeNav={()=>setOpened(false)} opened={opened} /></AppShell.Navbar>
    <AppShell.Header><HeaderPage navOpen={opened} setNav={setOpened} /> </AppShell.Header>
    <AppShell.Footer><FooterPage /></AppShell.Footer>
    <AppShell.Main>
      <Container size="lg">
            {children}
        </Container>
      <Space h="lg" />
    </AppShell.Main>
    </AppShell>
</>
}

export default MainLayout;

export const MenuDropDownWithButton = ({children}:{children:any}) => <Menu withArrow>
        <Menu.Target>
            <ActionIcon variant='transparent'>
                <RiMenu5Fill size={24} />
            </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
            {children}
        </Menu.Dropdown>
</Menu>
