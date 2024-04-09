import { ActionIcon, Badge, Button, Divider, LoadingOverlay, Space, Switch, TextInput, Title, Tooltip, useMantineTheme } from "@mantine/core"
import { useEffect, useState } from "react";
import { BsPlusLg, BsTrashFill } from "react-icons/bs"
import { rem } from '@mantine/core';
import { ActionType, Protocol, Rule, RuleMode, firewall, firewallRulesQuery } from "../../components/Firewall/utils";
import { errorNotify, getErrorMessage, isMediumScreen, makeid, okNotify } from "../../js/utils";
import { useListState, useMediaQuery } from '@mantine/hooks';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { TbGripVertical, TbReload } from "react-icons/tb";
import { useQueryClient } from "@tanstack/react-query";
import { TiTick } from "react-icons/ti";
import YesNoModal from "../../components/YesNoModal";
import { PortRangeInput } from "../../components/PortInput";
import { InterfaceInput } from "../../components/InterfaceInput";
import { ActionTypeSelector } from "../../components/Firewall/ActionTypeSelector";
import { ProtocolSelector } from "../../components/Firewall/ProtocolSelector";
import { ModeSelector } from "../../components/Firewall/ModeSelector";
import { OnOffButton } from "../../components/OnOffButton";
import { LuArrowBigRightDash } from "react-icons/lu"
import { ImCheckmark, ImCross } from "react-icons/im";
import { IoSettingsSharp } from "react-icons/io5";
import { SettingsModal } from "./SettingsModal";


export const Firewall = () => {

    const [tooltipAddOpened, setTooltipAddOpened] = useState(false);
    const [tooltipRefreshOpened, setTooltipRefreshOpened] = useState(false);
    const [tooltipApplyOpened, setTooltipApplyOpened] = useState(false);
    const [tooltipSettingsOpened, setTooltipSettingsOpened] = useState(false);
    const [currentPolicy, setCurrentPolicy] = useState<ActionType>(ActionType.ACCEPT)
    const [tooltipAddRulOpened, setTooltipAddRulOpened] = useState(false)
    const queryClient = useQueryClient()
    const rules = firewallRulesQuery()
    const [state, handlers] = useListState<Rule & {rule_id:string}>([]);
    const [enableFwModal, setEnableFwModal] = useState(false)
    const [applyChangeModal, setApplyChangeModal] = useState(false)
    const [settingsModal, setSettingsModal] = useState(false)
    const theme = useMantineTheme();
    const isMedium = useMediaQuery(`(min-width: 950px)`)??false
    const isSmall = useMediaQuery(`(max-width: 600px)`)??false

    const [updateMevalueinternal, internalUpdateme] = useState(false)
    const updateMe = () => {
      internalUpdateme(!updateMevalueinternal)
    }

    useEffect(()=> {
        if(rules.isError)
            errorNotify("Firewall Update failed!", getErrorMessage(rules.error))
    },[rules.isError])

    useEffect(()=> {
        if(!rules.isLoading && rules.isFetched && !rules.isFetching){
          setCurrentPolicy(rules.data?.policy??ActionType.ACCEPT)
          handlers.setState(JSON.parse(JSON.stringify((rules.data?.rules??[]).map( v => ({rule_id: makeid(30), ...v})))))
        }
    },[rules.isFetched, rules.isLoading, rules.isFetching])

    const fwEnabled = rules.data?.enabled??false
    const valuesChanged = JSON.stringify(rules.data?.rules) != JSON.stringify(state.map(v => {
      const {rule_id, ...rest} = v
      return rest
    })) || rules.data?.policy != currentPolicy

    const enableFirewall = () => {
      if (valuesChanged){
        applyChangesRaw().then(()=>enableFirewallRaw())
      }else{
        enableFirewallRaw()
      }
    }

    const enableFirewallRaw = () => {
      return firewall.enable()
      .then(()=>okNotify("Firewall enabled", "The firewall has been enabled"))
      .catch((e)=>errorNotify("Firewall enable failed!", getErrorMessage(e)))
    }

    const disableFirewallRaw = () => {
      return firewall.disable()
      .then(()=>okNotify("Firewall disabled", "The firewall has been disabled"))
      .catch((e)=>errorNotify("Firewall disable failed!", getErrorMessage(e)))
    }

    const switchState = () => {
      if (fwEnabled)
        disableFirewallRaw()
      else
        if ([ActionType.REJECT, ActionType.DROP].includes(currentPolicy) || valuesChanged){
          setEnableFwModal(true)
        }else{
          enableFirewall()
        }
    }

    const applyChanges = () => {
      if (fwEnabled && rules.data?.policy == ActionType.ACCEPT && [ActionType.REJECT, ActionType.DROP].includes(currentPolicy)){
        setApplyChangeModal(true)
      }else{
        applyChangesRaw()
      }
    }

    const condDiv = (val:React.ReactNode, cond:boolean) => {
      if (cond)
        return <div>{val}</div>
      else
        return val
    }

    const emptyRuleAdd = () => {
      handlers.insert(0,{
        rule_id: makeid(30),
        active: true,
        name: "Rule name",
        proto: Protocol.TCP,
        src: "",
        dst: "",
        port_src_from: 1,
        port_dst_from: 8080,
        port_src_to: 65535,
        port_dst_to: 8080,
        action: ActionType.ACCEPT,
        mode: RuleMode.IN
      })
    }

    const parseRules = () => {
      return state
    }

    const applyChangesRaw = () => {
      const parsedRules = parseRules()
      if (parsedRules === undefined){
        errorNotify("Firewall rules apply failed!", "The firewall rules are not valid")
        return Promise.reject()
      }else{
        return firewall.ruleset({rules:state, policy:currentPolicy})
        .then(()=>okNotify("Firewall rules applied", "The firewall rules has been applied"))
        .catch((e)=>errorNotify("Firewall rules apply failed!", getErrorMessage(e)))
      }
    }



    const items = state.map((item, index) => (
        <Draggable key={item.rule_id} index={index} draggableId={item.rule_id}>
          {(provided, snapshot) => {
            const customInt = [
              { value: "0.0.0.0/0", netint: "ANY IPv4" },
              { value: "::/0", netint: "ANY IPv6" },
              { value: "ANY", netint: "ANY" }
            ]
            const src_custom_int = customInt.map(v => v.value).includes(item.src)?[]:[{ value: item.src, netint: "SELECTED" }]
            const dst_custom_int = customInt.map(v => v.value).includes(item.dst)?[]:[{ value: item.dst, netint: "SELECTED" }]
            const [srcPortEnabled, setSrcPortEnabled] = useState(item.port_src_from != 1 || item.port_src_to != 65535)
            const [dstPortEnabled, setDstPortEnabled] = useState(item.port_dst_from != 1 || item.port_dst_to != 65535)
            const [srcPortValue, setSrcPortValue] = useState(item.port_src_from==item.port_src_to?`${item.port_src_from}`:`${item.port_src_from}-${item.port_src_to}`)
            const [dstPortValue, setDstPortValue] = useState(item.port_dst_from==item.port_dst_to?`${item.port_dst_from}`:`${item.port_dst_from}-${item.port_dst_to}`)

            const port_range_setter = (rule:Rule, v:string, {src=false, dst=false}:{src?:boolean, dst?:boolean}) => {
              const elements = v.split("-")
              const values = [elements[0]?parseInt(elements[0]):0, elements[1]?parseInt(elements[1]):0]
              values[1] = values[1]?values[1]:values[0]
              if (src){
                rule.port_src_from = values[0]
                rule.port_src_to = values[1]
                setSrcPortValue(v)
              }
              if (dst){
                rule.port_dst_from = values[0]
                rule.port_dst_to = values[1]
                setDstPortValue(v)
              }
              updateMe()
            }

            const ip_setter = (rule:Rule, v:string|null, {src=false, dst=false}:{src?:boolean, dst?:boolean}) => {
              const values = v?v:""
              if (src){
                rule.src = values
              }
              if (dst){
                rule.dst = values
              }
              updateMe()
            }

            const disable_style = { opacity:"0.4", cursor:"not-allowed" }
            const proto_any = item.proto == Protocol.ANY
            const disabletab = {
              port_box: proto_any,
              src_port: !srcPortEnabled || proto_any,
              dst_port: !dstPortEnabled || proto_any
            }

            const additionalStyle = {
              port_box: disabletab.port_box?disable_style:{},
              src_port: disabletab.src_port?disable_style:{},
              dst_port: disabletab.dst_port?disable_style:{}
            }

            return <div
              ref={provided.innerRef}
              {...provided.draggableProps}
            >
              <div className='center-flex' style={{width:"100%"}}>
              <div {...provided.dragHandleProps}>
                <TbGripVertical style={{ width: rem(30), height: rem(40) }} />
              </div>
              <Space w="sm" />
              <div className={isMedium?"center-flex":"center-flex-row"} style={{width:"100%"}}>
              <div className="center-flex-row" style={{width:"100%"}}>
                <div className="center-flex" style={{width:"97%"}}>
                <Switch
                  checked={item.active}
                  onChange={() =>{
                    item.active = !item.active
                    updateMe()
                  }}
                  color="teal"
                  size="lg"
                  thumbIcon={
                    item.active ? (
                      <ImCheckmark
                        style={{ width: rem(12), height: rem(12) }}
                        color={theme.colors.teal[6]}
                      />
                    ) : (
                      <ImCross
                        style={{ width: rem(12), height: rem(12) }}
                        color={theme.colors.red[6]}
                      />
                    )
                  }
                />
                <Space w="sm" />
                <ActionIcon color="red" onClick={()=>handlers.remove(index)} size="lg" radius="md" variant="filled"><BsTrashFill size={18} /></ActionIcon>
                <Space w="sm" />
                <TextInput defaultValue={item.name} onChange={(v)=>{item.name = v.target.value;updateMe()}} style={{width:"100%"}}/>
                </div>
                <Space h="sm" />
                <div className="center-flex" style={{width:"97%"}}>
                  <div style={{width:"100%"}}>
                  <InterfaceInput
                    initialCustomInterfaces={[...src_custom_int, ...customInt]}
                    value={item.src}
                    onChange={v => ip_setter(item, v, {src:true})}
                    includeInterfaceNames
                  />
                  <Space h="sm" />
                  <div className="center-flex" style={{width:"100%"}}>
                  <OnOffButton value={srcPortEnabled} onClick={() =>{
                    const value = !srcPortEnabled
                    setSrcPortEnabled(value)
                    if (!value){
                      item.port_src_from = 1
                      item.port_src_to = 65535
                      updateMe()
                    }else{
                      port_range_setter(item, srcPortValue, {src:true})
                    }
                  }} size="lg" disabled={disabletab.port_box} style={additionalStyle.port_box} variant="light" />
                  <Space w="xs" />
                  <PortRangeInput
                    onChange={v => port_range_setter(item, v.target.value, {src:true})}
                    value={srcPortValue}
                    disabled={disabletab.src_port}
                    error={!disabletab.src_port && !srcPortValue}
                    style={{width:"100%", ...additionalStyle.src_port}}
                  />
                  </div>
                  </div>
                  <Space w="lg" />
                  <LuArrowBigRightDash size={100} />
                  <Space w="lg" />
                  <div style={{width:"100%"}}>
                  <InterfaceInput
                    initialCustomInterfaces={[...dst_custom_int, ...customInt]}
                    value={item.dst}
                    onChange={v => ip_setter(item, v, {dst:true})}
                    includeInterfaceNames
                  />
                  <Space h="sm" />
                  <div className="center-flex" style={{width:"100%"}}>
                    <OnOffButton value={dstPortEnabled} onClick={() =>{
                      const value = !dstPortEnabled
                      setDstPortEnabled(value)
                      if (!value){
                        item.port_dst_from = 1
                        item.port_dst_to = 65535
                        updateMe()
                      }else{
                        port_range_setter(item, dstPortValue, {dst:true})
                      }
                    }} size="lg" disabled={disabletab.port_box} style={additionalStyle.port_box} variant="light" />
                    <Space w="xs" />
                    <PortRangeInput
                      onChange={v => port_range_setter(item, v.target.value, {dst:true})}
                      value={dstPortValue}
                      disabled={disabletab.dst_port}
                      error={!disabletab.dst_port && !dstPortValue}
                      style={{width:"100%", ...additionalStyle.dst_port}}
                    />
                  </div>
                  </div>
                </div>
              </div>
              {!isMedium?<Space h="sm" />:null}
              <div className={isMedium?"center-flex-row":"center-flex"} style={isMedium?{}:{width:"100%", justifyContent:"space-around"}}>
                  {condDiv(<>{condDiv(<ModeSelector
                      value={item.mode}
                      onChange={(value)=>{item.mode = value as RuleMode;updateMe()}}
                      style={{width:"100%"}}
                    />, !isMedium)}
                  <Space h="xs" />
                  {condDiv(<ProtocolSelector
                      value={item.proto}
                      onChange={(value)=>{item.proto = value as Protocol;updateMe()}}
                      style={{width:"100%"}}
                    />, !isMedium)}</>, isSmall)}
                  <Space h="xs" />
                  {condDiv(<ActionTypeSelector
                    value={item.action}
                    onChange={(value)=>{item.action = value as ActionType;updateMe()}}
                    style={{width:"100%"}}
                  />, !isMedium)}
              </div>
              </div>
              </div>
              <Space h="md" />
              <Divider />
              <Space h="md" />
            </div>
        }}
        </Draggable>
      ));


    return <>
        <Space h="sm" />
        <LoadingOverlay visible={rules.isLoading} />
        <div className={isMedium?'center-flex':'center-flex-row'}>
            <Title order={3}>Firewall Rules</Title>
            {isMedium?<div className='flex-spacer' />:<Space h="sm" />}
            <div className='center-flex'>
              Enabled: <Space w="sm" /> <Switch checked={fwEnabled} onChange={switchState} />
              <Space w="sm" />
              Policy:
              <Space w="xs" />
              <ActionTypeSelector
                  value={currentPolicy}
                  onChange={(value)=>setCurrentPolicy(value as ActionType)}
              />
            </div>
            {isMedium?<div className='flex-spacer' />:<Space h="sm" />}
            <div className='center-flex'>
              <Space w="xs" />
              <Badge size="sm" color="green" variant="filled">Rules: {rules.isLoading?0:rules.data?.rules.length}</Badge>
              <Space w="xs" />
              <Tooltip label="Add a new rule" position='bottom' color="blue" opened={tooltipAddOpened}>
                  <ActionIcon color="blue" onClick={emptyRuleAdd} size="lg" radius="md" variant="filled"
                  onFocus={() => setTooltipAddOpened(false)} onBlur={() => setTooltipAddOpened(false)}
                  onMouseEnter={() => setTooltipAddOpened(true)} onMouseLeave={() => setTooltipAddOpened(false)}><BsPlusLg size={18} /></ActionIcon>
              </Tooltip>
              <Space w="xs" />
              <Tooltip label="Refresh" position='bottom' color="indigo" opened={tooltipRefreshOpened}>
                  <ActionIcon color="indigo" onClick={()=>queryClient.invalidateQueries(["firewall"])} size="lg" radius="md" variant="filled"
                  loading={rules.isFetching}
                  onFocus={() => setTooltipRefreshOpened(false)} onBlur={() => setTooltipRefreshOpened(false)}
                  onMouseEnter={() => setTooltipRefreshOpened(true)} onMouseLeave={() => setTooltipRefreshOpened(false)}><TbReload size={18} /></ActionIcon>
              </Tooltip>
              <Space w="xs" />
              <Tooltip label="Settings" position='bottom' color="cyan" opened={tooltipSettingsOpened}>
                  <ActionIcon color="cyan" onClick={()=>setSettingsModal(true)} size="lg" radius="md" variant="filled"
                  onFocus={() => setTooltipSettingsOpened(false)} onBlur={() => setTooltipSettingsOpened(false)}
                  onMouseEnter={() => setTooltipSettingsOpened(true)} onMouseLeave={() => setTooltipSettingsOpened(false)}><IoSettingsSharp size={18} /></ActionIcon>
              </Tooltip>
              <Space w="xs" />
              <Tooltip label="Apply" position='bottom' color="grape" opened={tooltipApplyOpened}>
                  <ActionIcon color="grape" onClick={applyChanges} size="lg" radius="md" variant="filled"
                  onFocus={() => setTooltipApplyOpened(false)} onBlur={() => setTooltipApplyOpened(false)}
                  onMouseEnter={() => setTooltipApplyOpened(true)} onMouseLeave={() => setTooltipApplyOpened(false)}
                  disabled={!valuesChanged}
                  ><TiTick size={22} /></ActionIcon>
              </Tooltip>
            </div>
        </div>
        <Space h="xl" />
        <Divider />
        {items.length > 0?<DragDropContext
          onDragEnd={({ destination, source }) =>
            handlers.reorder({ from: source.index, to: destination?.index || 0 })
          }
        >
          <Space h="md" />
          <Droppable droppableId="dnd-list" direction="vertical">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef}>
                {items}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>:<>
    <Space h="xl"/> <Title className='center-flex' order={3}>No rule found! Add one clicking the "+" buttons</Title>
    <Space h="xl" /> <Space h="xl" /> 
    <div className='center-flex'>
        <Tooltip label="Add a new rule" color="blue" opened={tooltipAddRulOpened}>
            <ActionIcon color="blue" onClick={emptyRuleAdd} size="xl" radius="md" variant="filled"
                onFocus={() => setTooltipAddRulOpened(false)} onBlur={() => setTooltipAddRulOpened(false)}
                onMouseEnter={() => setTooltipAddRulOpened(true)} onMouseLeave={() => setTooltipAddRulOpened(false)}><BsPlusLg size="20px" /></ActionIcon>
        </Tooltip>
    </div>
</>}

      <YesNoModal
          title='Are you sure to apply the changes to the firewall?'
          description={`If there is a malconfiguration you can lose the access to your server! ⚠️`}
          onClose={()=>setEnableFwModal(false) }
          action={enableFirewall}
          opened={enableFwModal}
      />

      <YesNoModal
          title='Are you sure to apply the changes to the firewall?'
          description={`If there is a malconfiguration you can lose the access to your server! ⚠️`}
          onClose={()=>setApplyChangeModal(false) }
          action={applyChangesRaw}
          opened={applyChangeModal}
      />

      <SettingsModal
        opened={settingsModal}
        onClose={()=>setSettingsModal(false)}
      />


    </>
}